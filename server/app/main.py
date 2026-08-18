import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.files import router as files_router
from app.api.deliverables import router as deliverables_router
from app.api.projects import router as projects_router
from app.api.ai import router as ai_router
from app.api.copilot import router as copilot_router
from app.api.statistics import router as statistics_router
from app.api.auth import router as auth_router
from app.api.admin import router as admin_router
from app.api.snapshots import router as snapshots_router
from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.db.session import get_session
from app.db.session import AsyncSessionLocal
from app.services.settings_store import load_llm_overrides


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()

@asynccontextmanager
async def lifespan(_: FastAPI):
    async with AsyncSessionLocal() as session:
        await load_llm_overrides(session)
    logger.info("runtime LLM configuration loaded")
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

protected = [Depends(get_current_user)]
app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(files_router, prefix="/api/v1", dependencies=protected)
app.include_router(deliverables_router, prefix="/api/v1", dependencies=protected)
app.include_router(projects_router, prefix="/api/v1", dependencies=protected)
app.include_router(ai_router, prefix="/api/v1", dependencies=protected)
app.include_router(copilot_router, prefix="/api/v1", dependencies=protected)
app.include_router(statistics_router, prefix="/api/v1", dependencies=protected)
app.include_router(snapshots_router, prefix="/api/v1", dependencies=protected)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and {"detail", "code"} <= exc.detail.keys():
        content = exc.detail
    else:
        content = {"detail": str(exc.detail), "code": "HTTP_ERROR"}
    logger.warning("http error path=%s status=%s code=%s", request.url.path, exc.status_code, content["code"])
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    logger.warning("request validation failed path=%s errors=%s", request.url.path, exc.errors())
    return JSONResponse(
        status_code=422,
        content={"detail": "请求参数校验失败", "code": "VALIDATION_ERROR"},
    )


@app.get("/api/v1/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    logger.info("health check completed")
    return {"status": "ok", "database": "ok"}
