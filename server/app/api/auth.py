import logging, secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.dependencies import get_current_user
from app.api.errors import unauthorized
from app.core.config import get_settings
from app.core.security import hash_token, verify_password
from app.db.session import get_session
from app.models.auth_token import AuthToken
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, UserResponse
logger = logging.getLogger(__name__); router = APIRouter(prefix="/auth", tags=["auth"])
@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_session)) -> LoginResponse:
    user = await session.scalar(select(User).where(User.login == payload.login))
    if user is None or not verify_password(payload.password, user.password_hash):
        logger.warning("login rejected login=%s", payload.login); raise unauthorized("用户名或密码错误")
    raw = secrets.token_urlsafe(32); expires = datetime.now(timezone.utc) + timedelta(hours=get_settings().auth_token_ttl_hours)
    session.add(AuthToken(user_id=user.id, token_hash=hash_token(raw), expires_at=expires)); await session.commit()
    logger.info("login succeeded user_id=%s", user.id)
    return LoginResponse(token=raw, expires_at=expires.isoformat(), user=UserResponse.model_validate(user))
@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)): return UserResponse.model_validate(user)
