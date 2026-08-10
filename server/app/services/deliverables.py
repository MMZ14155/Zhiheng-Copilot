import logging
from collections import defaultdict

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import conflict, not_found
from app.models.contract_info import ContractInfo
from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.tag import Tag
from app.models.tag_snapshot import TagSnapshot
from app.models.tracked_file import TrackedFile
from app.models.workspace_file import WorkspaceFile

logger = logging.getLogger(__name__)


class DeliverableService:
    @staticmethod
    async def require_project(session: AsyncSession, project_id: int) -> Project:
        project = await session.get(Project, project_id)
        if project is None:
            raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")
        return project

    @staticmethod
    async def promote(
        session: AsyncSession,
        project_id: int,
        source_file_id: int,
        category: str,
        required: bool,
    ) -> TrackedFile:
        await DeliverableService.require_project(session, project_id)
        source = await session.scalar(
            select(WorkspaceFile)
            .where(WorkspaceFile.id == source_file_id)
            .with_for_update()
        )
        if source is None or source.project_id != project_id:
            raise not_found("项目下不存在指定来源文件", code="SOURCE_FILE_NOT_FOUND")
        if await session.scalar(
            select(TrackedFile).where(TrackedFile.source_file_id == source_file_id)
        ):
            raise conflict("来源文件已升格为交付物", code="FILE_ALREADY_TRACKED")
        versions = list(
            (
                await session.execute(
                    select(FileVersion)
                    .where(FileVersion.file_id == source_file_id)
                    .order_by(FileVersion.uploaded_at, FileVersion.version)
                )
            ).scalars()
        )
        current = versions[-1].version if versions else None
        tracked = TrackedFile(
            project_id=project_id,
            source_file_id=source.id,
            name=source.name,
            category=category,
            required=required,
            current_version=current,
            status="missing" if required and current is None else "ok",
        )
        session.add(tracked)
        await session.flush()
        if versions:
            await session.execute(
                update(FileVersion)
                .where(
                    FileVersion.file_id == source_file_id,
                    FileVersion.is_frozen.is_(False),
                )
                .values(is_frozen=True)
            )
        source.is_deliverable = True
        await session.flush()
        logger.info(
            "promoted source file project_id=%s file_id=%s tracked_file_id=%s versions=%s",
            project_id,
            source_file_id,
            tracked.id,
            len(versions),
        )
        return tracked

    @staticmethod
    async def list_with_state(
        session: AsyncSession, project_id: int
    ) -> list[tuple[TrackedFile, list[FileVersion], str]]:
        await DeliverableService.require_project(session, project_id)
        tracked_files = list(
            (
                await session.execute(
                    select(TrackedFile)
                    .where(TrackedFile.project_id == project_id)
                    .order_by(TrackedFile.created_at, TrackedFile.id)
                )
            ).scalars()
        )
        source_ids = [
            item.source_file_id
            for item in tracked_files
            if item.source_file_id is not None
        ]
        grouped: dict[int, list[FileVersion]] = defaultdict(list)
        if source_ids:
            rows = (
                await session.execute(
                    select(FileVersion)
                    .where(FileVersion.file_id.in_(source_ids))
                    .order_by(FileVersion.uploaded_at, FileVersion.version)
                )
            ).scalars()
            for version in rows:
                grouped[version.file_id].append(version)
        pins: dict[int, FileVersion] = {}
        if source_ids:
            rows = await session.execute(
                select(FileVersion, ContractInfo)
                .join(ContractInfo, ContractInfo.version == FileVersion.version)
                .where(FileVersion.file_id.in_(source_ids))
                .order_by(ContractInfo.created_at.desc(), ContractInfo.id.desc())
            )
            for version, _ in rows.all():
                pins.setdefault(version.file_id, version)
        result = []
        for tracked in tracked_files:
            versions = grouped.get(tracked.source_file_id or -1, [])
            result.append(
                (
                    tracked,
                    versions,
                    DeliverableService.calculate_status(
                        tracked, versions, pins.get(tracked.source_file_id or -1)
                    ),
                )
            )
        logger.info(
            "calculated deliverable states project_id=%s count=%s",
            project_id,
            len(result),
        )
        return result

    @staticmethod
    def calculate_status(
        tracked: TrackedFile,
        versions: list[FileVersion],
        contract_pin: FileVersion | None,
    ) -> str:
        if tracked.required and not tracked.current_version:
            return "missing"
        if sum(not version.is_frozen for version in versions) >= 2:
            return "conflict"
        if contract_pin is not None and tracked.current_version:
            current = next(
                (v for v in versions if v.version == tracked.current_version), None
            )
            if current is not None and contract_pin.uploaded_at < current.uploaded_at:
                return "old"
        return "ok"

    @staticmethod
    async def switch_current_version(
        session: AsyncSession, tracked_file_id: int, version: str
    ) -> TrackedFile:
        tracked = await session.scalar(
            select(TrackedFile)
            .where(TrackedFile.id == tracked_file_id)
            .with_for_update()
        )
        if tracked is None:
            raise not_found(
                f"交付物 {tracked_file_id} 不存在", code="TRACKED_FILE_NOT_FOUND"
            )
        target = await session.get(FileVersion, version)
        if target is None:
            raise not_found(f"版本 {version} 不存在", code="VERSION_NOT_FOUND")
        if tracked.source_file_id is None or target.file_id != tracked.source_file_id:
            raise conflict(
                "目标版本不属于该交付物的文件链", code="VERSION_CHAIN_MISMATCH"
            )
        tracked.current_version = version
        await session.flush()
        logger.info(
            "switched effective version tracked_file_id=%s version=%s",
            tracked_file_id,
            version,
        )
        return tracked


class TagService:
    @staticmethod
    async def require_tag(session: AsyncSession, tag_id: int) -> Tag:
        tag = await session.get(Tag, tag_id)
        if tag is None:
            raise not_found(f"标签 {tag_id} 不存在", code="TAG_NOT_FOUND")
        return tag

    @staticmethod
    async def create_snapshot(
        session: AsyncSession,
        tag_id: int,
        source_file_id: int,
        version: str,
        note: str | None,
    ) -> TagSnapshot:
        tag = await TagService.require_tag(session, tag_id)
        source = await session.get(WorkspaceFile, source_file_id)
        if source is None or source.project_id != tag.project_id:
            raise not_found(
                "标签所属项目下不存在指定来源文件", code="SOURCE_FILE_NOT_FOUND"
            )
        file_version = await session.get(FileVersion, version)
        if file_version is None:
            raise not_found(f"版本 {version} 不存在", code="VERSION_NOT_FOUND")
        if file_version.file_id != source_file_id:
            raise conflict("快照版本不属于指定来源文件", code="VERSION_CHAIN_MISMATCH")
        if await session.scalar(
            select(TagSnapshot).where(
                TagSnapshot.tag_id == tag_id,
                TagSnapshot.source_file_id == source_file_id,
                TagSnapshot.file_version == version,
            )
        ):
            raise conflict("该标签已存在相同文件版本快照", code="SNAPSHOT_EXISTS")
        snapshot = TagSnapshot(
            tag_id=tag.id,
            source_file_id=source.id,
            file_version=version,
            name=f"{tag.name} 快照",
            note=note or f"由标签 {tag.name} 创建的快照",
        )
        session.add(snapshot)
        await session.flush()
        logger.info(
            "created tag snapshot tag_id=%s file_id=%s version=%s",
            tag_id,
            source_file_id,
            version,
        )
        return snapshot
