import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from app.api.errors import conflict, not_found
from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.snapshot import Snapshot
from app.models.snapshot_entry import SnapshotEntry
from app.models.workspace_file import WorkspaceFile
from app.services.version_hash import VersionHashService

logger = logging.getLogger(__name__)

class SnapshotService:
    @staticmethod
    async def _heads(session: AsyncSession, project_id: int) -> list[tuple[WorkspaceFile, FileVersion]]:
        ranked = select(FileVersion, func.row_number().over(
            partition_by=FileVersion.file_id,
            order_by=(FileVersion.uploaded_at.desc(), FileVersion.version.desc()),
        ).label("version_rank")).subquery()
        head = aliased(FileVersion, ranked)
        rows = await session.execute(select(WorkspaceFile, head).join(
            head, (head.file_id == WorkspaceFile.id) & (ranked.c.version_rank == 1)
        ).where(WorkspaceFile.project_id == project_id, WorkspaceFile.is_deleted == False).order_by(WorkspaceFile.id))
        return list(rows.all())

    @staticmethod
    def calculate_hash(parent_hash: str | None, entries: list[tuple[int, str, str]], author: str,
                       message: str, created_at: datetime) -> str:
        tree = [{"file_id": file_id, "path": path, "version": version}
                for file_id, path, version in sorted(entries)]
        payload = {"parent_hash": parent_hash, "tree": tree, "author": author,
                   "message": message, "created_at": created_at.isoformat()}
        canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    async def create_snapshot(session: AsyncSession, project: Project, parent: Snapshot | None,
                              author: str, message: str) -> Snapshot:
        if parent is not None and parent.project_id != project.id:
            raise conflict("父快照不属于当前项目", code="SNAPSHOT_PARENT_PROJECT_MISMATCH")
        heads = await SnapshotService._heads(session, project.id)
        created_at = datetime.now(timezone.utc)
        tree = [(wf.id, wf.name, version.version) for wf, version in heads]
        snapshot_hash = SnapshotService.calculate_hash(parent.hash if parent else None, tree, author, message, created_at)
        snapshot = Snapshot(hash=snapshot_hash, project_id=project.id,
                            parent_hash=parent.hash if parent else None, author=author,
                            message=message, created_at=created_at)
        session.add(snapshot)
        for file_id, path, version in tree:
            session.add(SnapshotEntry(snapshot_hash=snapshot_hash, file_id=file_id, version=version, path=path))
        try:
            await session.flush()
        except IntegrityError as exc:
            constraint_name = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
            await session.rollback()
            if constraint_name in {"uq_snapshot_project_parent", "snapshot_pkey", "pk_snapshot"} or any(
                name in str(exc.orig) for name in ("uq_snapshot_project_parent", "snapshot_pkey")
            ):
                logger.warning("snapshot concurrency conflict project_id=%s parent=%s", project.id, parent.hash if parent else None)
                raise conflict("项目快照已更新，请刷新后重试", code="SNAPSHOT_STALE") from exc
            raise
        logger.info("created snapshot project_id=%s snapshot=%s entries=%s", project.id, snapshot_hash, len(tree))
        return snapshot

    @staticmethod
    async def latest(session: AsyncSession, project_id: int) -> Snapshot | None:
        return await session.scalar(select(Snapshot).where(Snapshot.project_id == project_id)
                                    .order_by(Snapshot.created_at.desc(), Snapshot.hash.desc()).limit(1))

    @staticmethod
    async def get(session: AsyncSession, snapshot_hash: str) -> Snapshot:
        snapshot = await session.get(Snapshot, snapshot_hash)
        if snapshot is None:
            raise not_found(f"快照 {snapshot_hash} 不存在", code="SNAPSHOT_NOT_FOUND")
        return snapshot

    @staticmethod
    async def restore(session: AsyncSession, target: Snapshot, author: str):
        current = await SnapshotService.latest(session, target.project_id)
        target_rows = (await session.execute(select(SnapshotEntry, FileVersion)
            .join(FileVersion, FileVersion.version == SnapshotEntry.version)
            .where(SnapshotEntry.snapshot_hash == target.hash).order_by(SnapshotEntry.file_id))).all()
        heads = {wf.id: (wf, version) for wf, version in await SnapshotService._heads(session, target.project_id)}
        restored: list[FileVersion] = []
        skipped: list[dict[str, object]] = []
        message = f"恢复快照 {target.hash}"
        for entry, target_version in target_rows:
            current_pair = heads.get(entry.file_id)
            if current_pair is None or current_pair[1].version == target_version.version:
                continue
            workspace_file, current_version = current_pair
            if current_version.is_frozen or target_version.is_frozen:
                skipped.append({"file_id": entry.file_id, "path": entry.path, "reason": "版本已冻结"})
                continue
            try:
                content = await asyncio.to_thread(Path(target_version.storage_path).read_bytes)
            except OSError as exc:
                logger.error("restore source missing version=%s path=%s", target_version.version, target_version.storage_path)
                raise not_found("目标版本的文件存储不存在", code="FILE_STORAGE_MISSING") from exc
            version_changelog = f"{message} 基于版本 {current_version.version}"
            version_hash = VersionHashService.generate_version_hash(
                [{"name": workspace_file.name, "content": content}], author, version_changelog)
            if await session.get(FileVersion, version_hash) is not None:
                raise conflict("恢复版本已存在", code="VERSION_EXISTS")
            restored_version = FileVersion(
                version=version_hash, file_id=entry.file_id, prev_version=current_version.version,
                storage_path=target_version.storage_path, content_hash=target_version.content_hash,
                size_bytes=target_version.size_bytes, uploaded_by=author, changelog=version_changelog,
                document_type=target_version.document_type, parse_status="pending", is_frozen=False)
            session.add(restored_version)
            restored.append(restored_version)
        await session.flush()
        project = await session.get(Project, target.project_id)
        if project is None:
            raise not_found(f"项目 {target.project_id} 不存在", code="PROJECT_NOT_FOUND")
        snapshot = await SnapshotService.create_snapshot(session, project, current, author, message)
        for version in restored:
            version.snapshot_hash = snapshot.hash
        await session.flush()
        logger.info("restored snapshot target=%s result=%s restored=%s skipped=%s",
                    target.hash, snapshot.hash, len(restored), len(skipped))
        return snapshot, len(restored), skipped
