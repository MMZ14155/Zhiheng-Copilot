import logging

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import conflict, not_found
from app.db.session import get_session
from app.models.contract_info import ContractInfo
from app.models.file_version import FileVersion
from app.models.llm_call import LlmCall
from app.models.project import Project
from app.models.summary import Summary
from app.models.task import Task
from app.schemas.ai import (
    ContractInfoResponse,
    LlmUsageResponse,
    SummaryHistoryResponse,
    SummaryResponse,
    TaskCreatedResponse,
    TaskResponse,
)
from app.services.ai_tasks import AiTaskExecutor

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ai"])


@router.post("/projects/{project_id}/summary", response_model=TaskCreatedResponse, status_code=202)
async def create_summary_task(
    project_id: int,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    if await session.get(Project, project_id) is None:
        raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")
    task = Task(
        project_id=project_id,
        task_type="summary_generation",
        status="pending",
        payload={"project_id": project_id},
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    background_tasks.add_task(AiTaskExecutor.run, task.id)
    logger.info("created summary task task_id=%s project_id=%s", task.id, project_id)
    return TaskCreatedResponse(task_id=task.id)


@router.get("/projects/{project_id}/summary", response_model=SummaryResponse)
async def latest_summary(project_id: int, session: AsyncSession = Depends(get_session)):
    if await session.get(Project, project_id) is None:
        raise not_found("项目不存在", code="PROJECT_NOT_FOUND")
    item = await session.scalar(
        select(Summary)
        .where(Summary.project_id == project_id)
        .order_by(Summary.version_no.desc())
        .limit(1)
    )
    if not item:
        raise not_found("项目尚无总结", code="SUMMARY_NOT_FOUND")
    return SummaryResponse.model_validate(item)


@router.get("/projects/{project_id}/summary/history", response_model=SummaryHistoryResponse)
async def summary_history(project_id: int, session: AsyncSession = Depends(get_session)):
    if await session.get(Project, project_id) is None:
        raise not_found("项目不存在", code="PROJECT_NOT_FOUND")
    rows = (
        await session.execute(
            select(Summary)
            .where(Summary.project_id == project_id)
            .order_by(Summary.version_no.desc())
        )
    ).scalars()
    return SummaryHistoryResponse(items=[SummaryResponse.model_validate(x) for x in rows])


@router.post("/versions/{version}/extract", response_model=TaskCreatedResponse, status_code=202)
async def create_extract_task(
    version: str,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    file_version = await session.get(FileVersion, version)
    if not file_version:
        raise not_found("版本不存在", code="VERSION_NOT_FOUND")
    if file_version.document_type != "contract":
        raise conflict("仅合同版本支持合同识别", code="NOT_CONTRACT_VERSION")
    task = Task(task_type="contract_recognition", status="pending", payload={"version": version})
    session.add(task)
    file_version.parse_status = "processing"
    await session.commit()
    await session.refresh(task)
    background_tasks.add_task(AiTaskExecutor.run, task.id)
    logger.info("created extraction task task_id=%s version=%s", task.id, version)
    return TaskCreatedResponse(task_id=task.id)


@router.get("/versions/{version}/extract", response_model=ContractInfoResponse)
async def get_extract(version: str, session: AsyncSession = Depends(get_session)):
    if await session.get(FileVersion, version) is None:
        raise not_found("版本不存在", code="VERSION_NOT_FOUND")
    item = await session.scalar(select(ContractInfo).where(ContractInfo.version == version))
    if not item:
        raise not_found("该版本尚无合同识别结果", code="EXTRACTION_NOT_FOUND")
    return ContractInfoResponse.model_validate(item)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, session: AsyncSession = Depends(get_session)):
    task = await session.get(Task, task_id)
    if not task:
        raise not_found("任务不存在", code="TASK_NOT_FOUND")
    usage = (
        await session.execute(
            select(
                func.count(LlmCall.id),
                func.coalesce(func.sum(LlmCall.input_tokens), 0),
                func.coalesce(func.sum(LlmCall.output_tokens), 0),
                func.coalesce(func.sum(LlmCall.cost), 0),
            ).where(LlmCall.task_id == task_id)
        )
    ).one()
    fields = (
        "id",
        "project_id",
        "task_type",
        "status",
        "payload",
        "failure_reason",
        "started_at",
        "finished_at",
        "created_at",
        "updated_at",
    )
    return TaskResponse(
        **{x: getattr(task, x) for x in fields},
        llm_usage=LlmUsageResponse(
            call_count=usage[0], input_tokens=usage[1], output_tokens=usage[2], cost=usage[3]
        ),
    )
