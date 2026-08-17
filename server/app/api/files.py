import logging

from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse

from app.api.errors import bad_request, not_found
from app.api.dependencies import get_current_user, require_project_role
from app.db.session import get_session
from app.models.file_version import FileVersion
from app.models.user import User
from app.models.project import Project
from app.models.workspace_file import WorkspaceFile
from app.schemas.files import (
    CreateFileResponse,
    FileVersionResponse,
    LatestFileVersionSummary,
    VersionListResponse,
    WorkspaceFileListResponse,
    WorkspaceFileSummary,
)
from app.services.file_versions import FileVersionService
from app.services.snapshots import SnapshotService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["files"])


def _version_to_response(fv: FileVersion) -> FileVersionResponse:
    return FileVersionResponse(
        version=fv.version,
        file_id=fv.file_id,
        prev_version=fv.prev_version,
        storage_path=fv.storage_path,
        content_hash=fv.content_hash,
        size_bytes=fv.size_bytes,
        uploaded_by=fv.uploaded_by,
        changelog=fv.changelog,
        document_type=fv.document_type,
        parse_status=fv.parse_status,
        is_frozen=fv.is_frozen,
        uploaded_at=fv.uploaded_at.isoformat(),
    )


@router.get("/projects/{project_id}/files", response_model=WorkspaceFileListResponse)
async def list_project_files(
    project_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> WorkspaceFileListResponse:
    await require_project_role(session, project_id, user)
    rows = await FileVersionService.list_project_files(session, project_id)
    return WorkspaceFileListResponse(
        project_id=project_id,
        files=[
            WorkspaceFileSummary(
                id=workspace_file.id,
                name=workspace_file.name,
                is_deliverable=workspace_file.is_deliverable,
                created_at=workspace_file.created_at,
                updated_at=workspace_file.updated_at,
                latest_version=(
                    LatestFileVersionSummary(
                        version=latest_version.version,
                        document_type=latest_version.document_type,
                        parse_status=latest_version.parse_status,
                        size_bytes=latest_version.size_bytes,
                        uploaded_at=latest_version.uploaded_at,
                    )
                    if latest_version is not None
                    else None
                ),
            )
            for workspace_file, latest_version in rows
        ],
    )


@router.post("/projects/{project_id}/files", response_model=CreateFileResponse)
async def create_file(
    project_id: int,
    name: str,
    uploaded_by: str | None = None,
    changelog: str = "",
    doc_type: str | None = None,
    file: UploadFile | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await require_project_role(session, project_id, user, {"manager", "implementer"})
    project = await session.get(Project, project_id)
    if project is None: raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")
    parent = await SnapshotService.latest(session, project_id)
    if file is None:
        raise bad_request("未提供上传文件", code="MISSING_FILE")
    content = await file.read()
    _, file_version = await FileVersionService.create_file_with_first_version(
        session=session,
        project_id=project_id,
        name=name,
        doc_type=doc_type,
        content=content,
        uploaded_by=user.name,
        changelog=changelog,
    )
    snapshot = await SnapshotService.create_snapshot(session, project, parent, user.name, changelog)
    file_version.snapshot_hash = snapshot.hash
    await session.commit()
    return CreateFileResponse(
        file_id=file_version.file_id,
        version=file_version.version,
        message="文件创建成功并上传首版本",
        snapshot=snapshot.hash,
    )


@router.post("/files/{file_id}/versions", response_model=CreateFileResponse)
async def append_version(
    file_id: int,
    uploaded_by: str | None = None,
    changelog: str = "",
    file: UploadFile | None = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    project_id = await session.scalar(select(WorkspaceFile.project_id).where(WorkspaceFile.id == file_id))
    if project_id is None: raise not_found(f"文件 {file_id} 不存在", code="FILE_NOT_FOUND")
    await require_project_role(session, project_id, user, {"manager", "implementer"})
    project = await session.get(Project, project_id)
    if project is None: raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")
    parent = await SnapshotService.latest(session, project_id)
    if file is None:
        raise bad_request("未提供上传文件", code="MISSING_FILE")
    content = await file.read()
    try:
        file_version = await FileVersionService.append_version(
            session=session,
            file_id=file_id,
            content=content,
            uploaded_by=user.name,
            changelog=changelog,
        )
        snapshot = await SnapshotService.create_snapshot(session, project, parent, user.name, changelog)
        file_version.snapshot_hash = snapshot.hash
    except Exception:
        await session.rollback()
        raise
    await session.commit()
    return CreateFileResponse(
        file_id=file_id,
        version=file_version.version,
        message="版本追加成功",
        snapshot=snapshot.hash,
    )


@router.get("/files/{file_id}/versions", response_model=VersionListResponse)
async def list_versions(file_id: int, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    project_id = await session.scalar(select(WorkspaceFile.project_id).where(WorkspaceFile.id == file_id))
    if project_id is None: raise not_found(f"文件 {file_id} 不存在", code="FILE_NOT_FOUND")
    await require_project_role(session, project_id, user)
    versions = await FileVersionService.get_version_chain(session, file_id)
    return VersionListResponse(
        file_id=file_id,
        versions=[_version_to_response(v) for v in versions],
    )


@router.get("/versions/{version}/download")
async def download_version(
    version: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    fv = await FileVersionService.get_version(session, version)
    project_id = await session.scalar(
        select(WorkspaceFile.project_id).where(WorkspaceFile.id == fv.file_id)
    )
    if project_id is None:
        logger.error(
            "version references missing workspace file version=%s file_id=%s",
            version,
            fv.file_id,
        )
        raise not_found(f"版本 {version} 所属文件不存在", code="FILE_NOT_FOUND")
    await require_project_role(session, project_id, user)
    from pathlib import Path as PPath

    path = PPath(fv.storage_path)
    if not path.exists():
        raise not_found(f"版本 {version} 的文件存储不存在", code="FILE_STORAGE_MISSING")
    media_type_map = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".jpg": "image/jpeg",
        ".png": "image/png",
    }
    ext = path.suffix.lower()
    media_type = media_type_map.get(ext, "application/octet-stream")
    return FileResponse(path=str(path), media_type=media_type, filename=path.name)
