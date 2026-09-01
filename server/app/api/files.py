import logging
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse, Response

from app.api.errors import bad_request, not_found, unsupported_media_type
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
from app.schemas.workspace_commit import WorkspaceCommitRequest, WorkspaceCommitResponse
from app.services.file_versions import FileVersionService
from app.services.snapshots import SnapshotService
from app.services.workspace_commit import WorkspaceCommitService
from app.services.docx_preview import docx_to_html
from app.services.text_extraction import get_extract_path, load_extracted_text

logger = logging.getLogger(__name__)
router = APIRouter(tags=["files"])

# 仅这些扩展名允许在线预览内联输出；html/svg 等可执行内容类型一律 415 防 XSS
PREVIEW_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
    ".log": "text/plain; charset=utf-8",
}


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
        extract_path=fv.extract_path,
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
                        extract_path=latest_version.extract_path,
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
    background_tasks: BackgroundTasks,
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
    background_tasks.add_task(
        FileVersionService.extract_text_for_version, file_version.version
    )
    return CreateFileResponse(
        file_id=file_version.file_id,
        version=file_version.version,
        message="文件创建成功并上传首版本",
        snapshot=snapshot.hash,
    )


@router.post("/files/{file_id}/versions", response_model=CreateFileResponse)
async def append_version(
    file_id: int,
    background_tasks: BackgroundTasks,
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
    background_tasks.add_task(
        FileVersionService.extract_text_for_version, file_version.version
    )
    return CreateFileResponse(
        file_id=file_id,
        version=file_version.version,
        message="版本追加成功",
        snapshot=snapshot.hash,
    )


@router.post("/projects/{project_id}/workspace-commit", response_model=WorkspaceCommitResponse)
async def workspace_commit(
    project_id: int,
    payload: WorkspaceCommitRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await require_project_role(session, project_id, user, {"manager", "implementer"})
    project = await session.get(Project, project_id)
    if project is None:
        raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")
    try:
        snapshot_hash = await WorkspaceCommitService.commit(
            session=session,
            project=project,
            author=user.name,
            message=payload.message or "",
            operations=[op.model_dump() for op in payload.operations],
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return WorkspaceCommitResponse(snapshot=snapshot_hash, message="工作区提交成功")


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


async def _resolve_version_storage(
    session: AsyncSession, version: str, user: User
) -> tuple[FileVersion, Path]:
    # download 与 preview 共用的版本解析、项目成员鉴权与落盘路径校验，避免两处口径分叉
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
    path = Path(fv.storage_path)
    if not path.exists():
        raise not_found(f"版本 {version} 的文件存储不存在", code="FILE_STORAGE_MISSING")
    return fv, path


@router.get("/versions/{version}/download")
async def download_version(
    version: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _, path = await _resolve_version_storage(session, version, user)
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


@router.get("/versions/{version}/preview")
async def preview_version(
    version: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _, path = await _resolve_version_storage(session, version, user)
    ext = path.suffix.lower()
    if ext == ".docx":
        html = docx_to_html(path)
        logger.info("preview converted docx version=%s", version)
        return Response(
            content=html,
            media_type="text/html",
            headers={
                "Content-Disposition": f"inline; filename*=UTF-8''{quote(path.name)}",
                "X-Content-Type-Options": "nosniff",
            },
        )
    media_type = PREVIEW_MEDIA_TYPES.get(ext)
    if media_type is None:
        logger.info(
            "preview rejected unsupported type version=%s ext=%s", version, ext
        )
        raise unsupported_media_type(
            f"文件类型 '{ext}' 不支持在线预览，请改用下载"
        )
    logger.info("preview served version=%s ext=%s", version, ext)
    headers = {
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(path.name)}",
        "X-Content-Type-Options": "nosniff",
    }
    return FileResponse(path=str(path), media_type=media_type, headers=headers)


@router.get("/versions/{version}/extract-text")
async def get_extract_text(
    version: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    fv, _ = await _resolve_version_storage(session, version, user)
    # 兼容 extract_path 未写入数据库但 .md 文件已由识别任务生成的情况
    extract_path = fv.extract_path
    text = None
    if extract_path:
        text = load_extracted_text(extract_path)
    if text is None:
        fallback_path = get_extract_path(fv.content_hash)
        text = load_extracted_text(fallback_path)
        if text is not None and fallback_path != extract_path:
            fv.extract_path = str(fallback_path)
            await session.commit()
            logger.info("backfilled extract_path version=%s path=%s", version, fallback_path)
    if text is None:
        raise not_found("该版本尚未提取文本", code="EXTRACT_TEXT_NOT_FOUND")
    return Response(
        content=text,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(fv.content_hash)}.md",
            "X-Content-Type-Options": "nosniff",
            "X-Content-Hash": fv.content_hash,
        },
    )
