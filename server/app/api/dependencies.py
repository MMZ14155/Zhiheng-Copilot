import logging
from datetime import datetime, timezone
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.errors import forbidden, unauthorized
from app.core.config import get_settings
from app.core.security import hash_token
from app.db.session import get_session
from app.models.auth_token import AuthToken
from app.models.project_member import ProjectMember
from app.models.user import User
logger = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False)
disabled_admin = User(id=0, login="auth-disabled", name="开发管理员", is_admin=True, password_hash="disabled")

async def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), session: AsyncSession = Depends(get_session)) -> User:
    if get_settings().auth_disabled: return disabled_admin
    if credentials is None or credentials.scheme.lower() != "bearer": raise unauthorized()
    row = (await session.execute(select(AuthToken, User).join(User, User.id == AuthToken.user_id).where(AuthToken.token_hash == hash_token(credentials.credentials)))).first()
    if row is None or row.AuthToken.expires_at <= datetime.now(timezone.utc): raise unauthorized("登录凭证无效或已过期")
    return row.User

async def require_project_role(session: AsyncSession, project_id: int, user: User, allowed_roles: set[str] | None = None) -> ProjectMember | None:
    if user.is_admin: return None
    member = await session.scalar(select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id))
    if member is None or (allowed_roles is not None and member.role not in allowed_roles):
        logger.warning("project access denied project_id=%s user_id=%s", project_id, user.id)
        raise forbidden()
    return member
