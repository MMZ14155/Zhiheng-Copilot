import hashlib
import logging
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.errors import conflict, not_found, payload_too_large, unsupported_media_type
from app.core.config import get_settings
from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.workspace_file import WorkspaceFile
from app.services.version_hash import VersionHashService

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".jpg", ".png"}
MAX_FILE_SIZE = 50 * 1024 * 1024


class FileVersionService:
    @staticmethod
    async def list_project_files(
        session: AsyncSession, project_id: int
    ) -> list[tuple[WorkspaceFile, FileVersion | None]]:
        if await session.get(Project, project_id) is None:
            raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")

        latest_versions = (
            select(
                FileVersion,
                func.row_number()
                .over(
                    partition_by=FileVersion.file_id,
                    order_by=(
                        FileVersion.uploaded_at.desc(),
                        FileVersion.version.desc(),
                    ),
                )
                .label("version_rank"),
            )
            .subquery()
        )
        latest_version = aliased(FileVersion, latest_versions)
        rows = await session.execute(
            select(WorkspaceFile, latest_version)
            .outerjoin(
                latest_version,
                (latest_version.file_id == WorkspaceFile.id)
                & (latest_versions.c.version_rank == 1),
            )
            .where(WorkspaceFile.project_id == project_id)
            .order_by(WorkspaceFile.created_at, WorkspaceFile.id)
        )
        files = list(rows.all())
        logger.info("listed workspace files project_id=%s count=%s", project_id, len(files))
        return files

    @staticmethod
    def _validate_file(filename: str, size: int) -> None:
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise unsupported_media_type(f"不支持的文件类型 '{ext}'")
        if size > MAX_FILE_SIZE:
            raise payload_too_large(f"文件大小 {size} 超过上限 50MB")

    @staticmethod
    async def get_workspace_file(session: AsyncSession, file_id: int) -> WorkspaceFile:
        wf = (
            await session.execute(select(WorkspaceFile).where(WorkspaceFile.id == file_id))
        ).scalar_one_or_none()
        if not wf:
            raise not_found(f"文件实体 {file_id} 不存在")
        return wf

    @staticmethod
    async def get_tail_version(session: AsyncSession, file_id: int) -> FileVersion | None:
        return (
            await session.execute(
                select(FileVersion)
                .where(FileVersion.file_id == file_id)
                .order_by(FileVersion.uploaded_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    @staticmethod
    async def create_file_with_first_version(
        session: AsyncSession,
        project_id: int,
        name: str,
        doc_type: str | None,
        content: bytes,
        uploaded_by: str,
        changelog: str,
    ):
        FileVersionService._validate_file(name, len(content))
        vhash = VersionHashService.generate_version_hash(
            [{"name": name, "content": content}], uploaded_by, changelog
        )
        chash = hashlib.sha256(content).hexdigest()
        wf = WorkspaceFile(project_id=project_id, name=name, is_deliverable=False)
        session.add(wf)
        await session.flush()
        s = get_settings()
        d = Path(s.api_data_dir) / "uploads" / str(project_id) / vhash
        d.mkdir(parents=True, exist_ok=True)
        p = str(d / name)
        with open(p, "wb") as f:
            f.write(content)
        fv = FileVersion(
            version=vhash,
            file_id=wf.id,
            prev_version=None,
            storage_path=p,
            content_hash=chash,
            size_bytes=len(content),
            uploaded_by=uploaded_by,
            changelog=changelog,
            document_type=doc_type,
            parse_status="pending",
            is_frozen=False,
        )
        session.add(fv)
        return wf, fv

    @staticmethod
    async def append_version(
        session: AsyncSession,
        file_id: int,
        content: bytes,
        uploaded_by: str,
        changelog: str,
    ):
        wf = await FileVersionService.get_workspace_file(session, file_id)
        FileVersionService._validate_file(wf.name, len(content))
        tail = await FileVersionService.get_tail_version(session, file_id)
        if tail is None:
            raise conflict(f"文件 {file_id} 无可用版本链")
        vhash = VersionHashService.generate_version_hash(
            [{"name": wf.name, "content": content}], uploaded_by, changelog
        )
        chash = hashlib.sha256(content).hexdigest()
        s = get_settings()
        d = Path(s.api_data_dir) / "uploads" / str(wf.project_id) / vhash
        d.mkdir(parents=True, exist_ok=True)
        p = str(d / wf.name)
        with open(p, "wb") as f:
            f.write(content)
        fv = FileVersion(
            version=vhash,
            file_id=file_id,
            prev_version=tail.version,
            storage_path=p,
            content_hash=chash,
            size_bytes=len(content),
            uploaded_by=uploaded_by,
            changelog=changelog,
            document_type=tail.document_type,
            parse_status="pending",
            is_frozen=False,
        )
        session.add(fv)
        return fv

    @staticmethod
    async def get_version_chain(session: AsyncSession, file_id: int):
        await FileVersionService.get_workspace_file(session, file_id)
        return list(
            (
                await session.execute(
                    select(FileVersion)
                    .where(FileVersion.file_id == file_id)
                    .order_by(FileVersion.uploaded_at.asc())
                )
            )
            .scalars()
            .all()
        )

    @staticmethod
    async def get_version(session: AsyncSession, version: str):
        fv = (
            await session.execute(select(FileVersion).where(FileVersion.version == version))
        ).scalar_one_or_none()
        if not fv:
            raise not_found(f"版本 {version} 不存在")
        return fv
