import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import conflict
from app.api.dependencies import get_current_user, require_project_role
from app.api.files import _version_to_response
from app.db.session import get_session
from app.models.tag import Tag
from app.models.tag_snapshot import TagSnapshot
from app.models.tracked_file import TrackedFile
from app.models.user import User
from app.schemas.deliverables import (
    CurrentVersionUpdate,
    ProjectTagSnapshotItem,
    ProjectTagSnapshotListResponse,
    TagCreate,
    TagListResponse,
    TagResponse,
    TagSnapshotCreate,
    TagSnapshotListResponse,
    TagSnapshotResponse,
    TrackedFileCreate,
    TrackedFileListResponse,
    TrackedFileResponse,
)
from app.services.deliverables import DeliverableService, TagService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["deliverables"])


def _serialize(tracked, versions, status):
    return TrackedFileResponse(
        id=tracked.id,
        project_id=tracked.project_id,
        source_file_id=tracked.source_file_id,
        name=tracked.name,
        category=tracked.category,
        required=tracked.required,
        current_version=tracked.current_version,
        status=status,
        versions=[_version_to_response(v) for v in versions],
        created_at=tracked.created_at,
        updated_at=tracked.updated_at,
    )


async def _tracked_response(session, tracked_id):
    item = await session.get(TrackedFile, tracked_id)
    state = next(
        row
        for row in await DeliverableService.list_with_state(session, item.project_id)
        if row[0].id == tracked_id
    )
    return _serialize(*state)


@router.post(
    "/projects/{project_id}/tracked-files",
    response_model=TrackedFileResponse,
    status_code=201,
)
async def promote_tracked_file(
    project_id: int,
    payload: TrackedFileCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await require_project_role(session, project_id, user, {"manager"})
    try:
        tracked = await DeliverableService.promote(
            session,
            project_id,
            payload.source_file_id,
            payload.category,
            payload.required,
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise conflict("来源文件已升格为交付物", code="FILE_ALREADY_TRACKED") from exc
    except Exception:
        await session.rollback()
        raise
    return await _tracked_response(session, tracked.id)


@router.get(
    "/projects/{project_id}/tracked-files", response_model=TrackedFileListResponse
)
async def list_tracked_files(
    project_id: int, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)
):
    await require_project_role(session, project_id, user)
    return TrackedFileListResponse(
        items=[
            _serialize(*row)
            for row in await DeliverableService.list_with_state(session, project_id)
        ]
    )


@router.patch(
    "/tracked-files/{tracked_file_id}/current-version",
    response_model=TrackedFileResponse,
)
async def switch_current_version(
    tracked_file_id: int,
    payload: CurrentVersionUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tracked_access = await session.get(TrackedFile, tracked_file_id)
    if tracked_access: await require_project_role(session, tracked_access.project_id, user, {"manager"})
    try:
        tracked = await DeliverableService.switch_current_version(
            session, tracked_file_id, payload.version
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return await _tracked_response(session, tracked.id)


@router.post("/projects/{project_id}/tags", response_model=TagResponse, status_code=201)
async def create_tag(
    project_id: int, payload: TagCreate, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)
):
    await require_project_role(session, project_id, user, {"manager"})
    await DeliverableService.require_project(session, project_id)
    tag = Tag(project_id=project_id, **payload.model_dump())
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    logger.info("created tag project_id=%s tag_id=%s", project_id, tag.id)
    return TagResponse.model_validate(tag)


@router.get("/projects/{project_id}/tags", response_model=TagListResponse)
async def list_tags(project_id: int, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    await require_project_role(session, project_id, user)
    await DeliverableService.require_project(session, project_id)
    tags = (
        await session.execute(
            select(Tag)
            .where(Tag.project_id == project_id)
            .order_by(Tag.created_at.desc(), Tag.id.desc())
        )
    ).scalars()
    return TagListResponse(items=[TagResponse.model_validate(tag) for tag in tags])


@router.post(
    "/tags/{tag_id}/snapshots", response_model=TagSnapshotResponse, status_code=201
)
async def create_tag_snapshot(
    tag_id: int,
    payload: TagSnapshotCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tag_access = await session.get(Tag, tag_id)
    if tag_access: await require_project_role(session, tag_access.project_id, user, {"manager"})
    try:
        snapshot = await TagService.create_snapshot(
            session, tag_id, payload.source_file_id, payload.version, payload.note
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise conflict("该标签已存在相同文件版本快照", code="SNAPSHOT_EXISTS") from exc
    except Exception:
        await session.rollback()
        raise
    await session.refresh(snapshot)
    return TagSnapshotResponse.model_validate(snapshot, from_attributes=True)


@router.get("/tags/{tag_id}/snapshots", response_model=TagSnapshotListResponse)
async def list_tag_snapshots(tag_id: int, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    tag_access = await session.get(Tag, tag_id)
    if tag_access: await require_project_role(session, tag_access.project_id, user)
    await TagService.require_tag(session, tag_id)
    rows = (
        await session.execute(
            select(TagSnapshot)
            .where(TagSnapshot.tag_id == tag_id)
            .order_by(TagSnapshot.created_at.desc(), TagSnapshot.id.desc())
        )
    ).scalars()
    return TagSnapshotListResponse(
        items=[
            TagSnapshotResponse.model_validate(row, from_attributes=True)
            for row in rows
        ]
    )


# 项目级批量快照：资料中心一次拉取全部标签快照，避免按标签逐个请求。
@router.get(
    "/projects/{project_id}/tag-snapshots",
    response_model=ProjectTagSnapshotListResponse,
)
async def list_project_tag_snapshots(project_id: int, session: AsyncSession = Depends(get_session), user: User = Depends(get_current_user)):
    await require_project_role(session, project_id, user)
    await DeliverableService.require_project(session, project_id)
    rows = (
        await session.execute(
            select(TagSnapshot, Tag.name)
            .join(Tag, Tag.id == TagSnapshot.tag_id)
            .where(Tag.project_id == project_id)
            .order_by(TagSnapshot.created_at.desc(), TagSnapshot.id.desc())
        )
    ).all()
    return ProjectTagSnapshotListResponse(
        items=[
            ProjectTagSnapshotItem(
                **TagSnapshotResponse.model_validate(
                    snapshot, from_attributes=True
                ).model_dump(),
                tag_name=tag_name,
            )
            for snapshot, tag_name in rows
        ]
    )
