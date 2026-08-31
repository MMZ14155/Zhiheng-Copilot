import logging

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_admin
from app.api.errors import conflict, not_found
from app.core.security import hash_password
from app.db.session import get_session
from app.models.auth_token import AuthToken
from app.models.file_version import FileVersion
from app.models.llm_call import LlmCall
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.project_link import ProjectLink
from app.models.snapshot import Snapshot
from app.models.snapshot_entry import SnapshotEntry
from app.models.summary import Summary
from app.models.tag import Tag
from app.models.tag_snapshot import TagSnapshot
from app.models.task import Task
from app.models.tracked_file import TrackedFile
from app.models.user import User
from app.models.system_setting import SystemSetting
from app.models.workspace_file import WorkspaceFile
from app.schemas.admin import (
    AdminUserCreate,
    AdminUserResponse,
    ProjectMemberCreate,
    ProjectMemberResponse,
    LlmConfigResponse,
    LlmConfigTestResponse,
    LlmConfigUpdate,
)
from app.services.llm_kimi import create_llm_provider
from app.services.settings_store import (
    DB_KEYS,
    get_effective_llm_settings,
    load_llm_overrides,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class _LlmConfigTestOutput(BaseModel):
    answer: str


def _llm_config_response() -> LlmConfigResponse:
    effective = get_effective_llm_settings()
    return LlmConfigResponse(
        provider=effective.provider,
        base_url=effective.base_url,
        model=effective.model,
        timeout_seconds=effective.timeout_seconds,
        input_price_per_mtok=effective.input_price_per_mtok,
        output_price_per_mtok=effective.output_price_per_mtok,
        api_key_set=bool(effective.api_key),
        api_key_masked=f"****{effective.api_key[-4:]}" if effective.api_key else None,
        source=effective.source,
    )


@router.get("/llm-config", response_model=LlmConfigResponse)
async def get_llm_config() -> LlmConfigResponse:
    return _llm_config_response()


@router.put("/llm-config", response_model=LlmConfigResponse)
async def update_llm_config(
    payload: LlmConfigUpdate,
    session: AsyncSession = Depends(get_session),
) -> LlmConfigResponse:
    changes = payload.model_dump(exclude_unset=True)
    for name, value in changes.items():
        if value is None:
            continue
        key = DB_KEYS[name]
        if name == "api_key" and value == "":
            await session.execute(delete(SystemSetting).where(SystemSetting.key == key))
            continue
        stored = await session.get(SystemSetting, key)
        text_value = str(value)
        if stored is None:
            session.add(SystemSetting(key=key, value=text_value))
        else:
            stored.value = text_value
    await session.commit()
    await load_llm_overrides(session)
    logger.info("admin updated LLM configuration fields=%s", sorted(changes))
    return _llm_config_response()


@router.post("/llm-config/test", response_model=LlmConfigTestResponse)
async def test_llm_config() -> LlmConfigTestResponse:
    try:
        provider = create_llm_provider()
        await provider.generate(
            "请仅返回 JSON，answer 字段值为 ok。",
            _LlmConfigTestOutput,
        )
        return LlmConfigTestResponse(ok=True, detail="LLM 配置连接成功")
    except Exception as exc:
        logger.warning("LLM configuration test failed error_type=%s", type(exc).__name__)
        return LlmConfigTestResponse(ok=False, detail="LLM 配置连接失败")


@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(session: AsyncSession = Depends(get_session)) -> list[AdminUserResponse]:
    users = (await session.scalars(select(User).order_by(User.id))).all()
    return [AdminUserResponse.model_validate(user) for user in users]


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreate,
    session: AsyncSession = Depends(get_session),
) -> AdminUserResponse:
    user = User(
        login=payload.login,
        name=payload.name,
        is_admin=payload.is_admin,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        logger.warning("admin user create conflict login=%s", payload.login)
        raise conflict("登录名已存在", code="USER_LOGIN_EXISTS") from exc
    await session.refresh(user)
    logger.info("admin created user id=%s login=%s", user.id, user.login)
    return AdminUserResponse.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
) -> Response:
    user = await session.get(User, user_id)
    if user is None:
        raise not_found(f"用户 {user_id} 不存在", code="USER_NOT_FOUND")
    if user.id == admin.id:
        raise conflict("不能删除当前登录的管理员", code="CANNOT_DELETE_SELF")
    if user.is_admin:
        admin_count = await session.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True)))
        if (admin_count or 0) <= 1:
            raise conflict("不能删除系统最后一名管理员", code="CANNOT_DELETE_LAST_ADMIN")

    await session.execute(delete(AuthToken).where(AuthToken.user_id == user.id))
    await session.delete(user)
    await session.commit()
    logger.info("admin deleted user id=%s", user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects/{project_id}/members", response_model=list[ProjectMemberResponse])
async def list_project_members(
    project_id: int,
    session: AsyncSession = Depends(get_session),
) -> list[ProjectMemberResponse]:
    if await session.get(Project, project_id) is None:
        raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")
    rows = (
        await session.execute(
            select(ProjectMember, User)
            .join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.id)
        )
    ).all()
    return [
        ProjectMemberResponse(
            user_id=member.user_id,
            login=user.login,
            name=user.name,
            role=member.role,
            created_at=member.created_at,
        )
        for member, user in rows
    ]


@router.post(
    "/projects/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_member(
    project_id: int,
    payload: ProjectMemberCreate,
    session: AsyncSession = Depends(get_session),
) -> ProjectMemberResponse:
    if await session.get(Project, project_id) is None:
        raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")
    user = await session.get(User, payload.user_id)
    if user is None:
        raise not_found(f"用户 {payload.user_id} 不存在", code="USER_NOT_FOUND")

    member = ProjectMember(project_id=project_id, user_id=user.id, role=payload.role)
    session.add(member)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        logger.warning("project member create conflict project_id=%s user_id=%s", project_id, user.id)
        raise conflict("用户已是项目成员", code="PROJECT_MEMBER_EXISTS") from exc
    await session.refresh(member)
    logger.info("admin assigned project member project_id=%s user_id=%s role=%s", project_id, user.id, member.role)
    return ProjectMemberResponse(
        user_id=user.id,
        login=user.login,
        name=user.name,
        role=member.role,
        created_at=member.created_at,
    )


@router.delete("/projects/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_member(
    project_id: int,
    user_id: int,
    session: AsyncSession = Depends(get_session),
) -> Response:
    member = await session.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if member is None:
        raise not_found("项目成员不存在", code="PROJECT_MEMBER_NOT_FOUND")
    await session.delete(member)
    await session.commit()
    logger.info("admin removed project member project_id=%s user_id=%s", project_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _delete_project_records(session: AsyncSession, project_id: int) -> None:
    """按外键依赖顺序清理项目关联数据，避免 RESTRICT 约束导致删除失败。"""
    # LLM 调用记录直接删除
    await session.execute(delete(LlmCall).where(LlmCall.project_id == project_id))

    # 快照相关：先删快照条目、解除版本引用，再按时间倒序删快照（子快照先于父快照）
    snapshot_hashes = (
        await session.scalars(
            select(Snapshot.hash).where(Snapshot.project_id == project_id)
        )
    ).all()
    if snapshot_hashes:
        await session.execute(
            delete(SnapshotEntry).where(SnapshotEntry.snapshot_hash.in_(snapshot_hashes))
        )
        await session.execute(
            update(FileVersion)
            .where(FileVersion.snapshot_hash.in_(snapshot_hashes))
            .values(snapshot_hash=None)
        )
        # 逐层删除叶子快照，避免 snapshot 自引用 RESTRICT 外键冲突
        while True:
            leaf_hashes = (
                await session.scalars(
                    select(Snapshot.hash)
                    .where(
                        Snapshot.project_id == project_id,
                        ~Snapshot.hash.in_(
                            select(Snapshot.parent_hash)
                            .where(
                                Snapshot.project_id == project_id,
                                Snapshot.parent_hash.is_not(None),
                            )
                            .scalar_subquery()
                        ),
                    )
                )
            ).all()
            if not leaf_hashes:
                break
            await session.execute(
                delete(Snapshot).where(Snapshot.hash.in_(leaf_hashes))
            )

    # 摘要、任务、标签
    await session.execute(delete(Summary).where(Summary.project_id == project_id))
    await session.execute(delete(Task).where(Task.project_id == project_id))

    tag_ids = (
        await session.scalars(select(Tag.id).where(Tag.project_id == project_id))
    ).all()
    if tag_ids:
        await session.execute(delete(TagSnapshot).where(TagSnapshot.tag_id.in_(tag_ids)))
        await session.execute(delete(Tag).where(Tag.id.in_(tag_ids)))

    # 跟踪文件与项目文件/版本（版本按上传时间倒序删，避免 prev_version RESTRICT）
    await session.execute(delete(TrackedFile).where(TrackedFile.project_id == project_id))

    file_ids = (
        await session.scalars(
            select(WorkspaceFile.id).where(WorkspaceFile.project_id == project_id)
        )
    ).all()
    if file_ids:
        versions = (
            await session.scalars(
                select(FileVersion.version)
                .where(FileVersion.file_id.in_(file_ids))
                .order_by(FileVersion.uploaded_at.desc())
            )
        ).all()
        for version in versions:
            await session.execute(
                delete(FileVersion).where(FileVersion.version == version)
            )
        await session.execute(delete(WorkspaceFile).where(WorkspaceFile.id.in_(file_ids)))

    # 项目成员
    await session.execute(delete(ProjectMember).where(ProjectMember.project_id == project_id))


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    session: AsyncSession = Depends(get_session),
) -> Response:
    project = await session.get(Project, project_id)
    if project is None:
        raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")
    await _delete_project_records(session, project.id)
    await session.delete(project)
    await session.commit()
    logger.info("admin deleted project id=%s", project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

