import logging

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_admin
from app.api.errors import conflict, not_found
from app.core.security import hash_password
from app.db.session import get_session
from app.models.auth_token import AuthToken
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User
from app.schemas.admin import (
    AdminUserCreate,
    AdminUserResponse,
    ProjectMemberCreate,
    ProjectMemberResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


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
