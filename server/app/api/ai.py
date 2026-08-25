import json
import logging
import os
import tempfile

from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import conflict, not_found
from app.api.dependencies import get_current_user, require_project_role
from app.db.session import get_session
from app.models.contract_info import ContractInfo
from app.models.file_version import FileVersion
from app.models.invoice_info import InvoiceInfo
from app.models.llm_call import LlmCall
from app.models.project import Project
from app.models.payment_info import PaymentInfo
from app.models.summary import Summary
from app.models.summary_input import SummaryInput
from app.models.task import Task
from app.models.tracked_file import TrackedFile
from app.models.user import User
from app.models.workspace_file import WorkspaceFile
from app.schemas.ai import (
    ContractInfoResponse,
    InvoiceInfoResponse,
    LlmUsageResponse,
    PaymentInfoResponse,
    ProjectDraftOutput,
    SummaryAnswersRequest,
    SummaryAnswersTaskResponse,
    SummaryHistoryResponse,
    SummaryInputResponse,
    SummaryResponse,
    TaskCreatedResponse,
    TaskResponse,
)
from app.services.ai_tasks import AiTaskExecutor
from app.services.ai_tasks import NullFileContentExtractor, create_file_content_extractor
from app.services.file_versions import FileVersionService
from app.services.llm import LoggedLlmClient

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ai"])


# 建项草稿需要登录态：匿名调用会消耗 LLM 配额。
@router.post("/ai/project-draft", response_model=ProjectDraftOutput)
async def create_project_draft(
    file: UploadFile,
    user: User = Depends(get_current_user),
) -> ProjectDraftOutput:
    filename = file.filename or ""
    content = await file.read()
    safe_name = FileVersionService._validate_file(filename, len(content))
    suffix = os.path.splitext(safe_name)[1]
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary:
            temporary.write(content)
            temporary_path = temporary.name
        extractor = create_file_content_extractor()
        document_text = None
        if not isinstance(extractor, NullFileContentExtractor):
            document_text = await extractor.extract_text(temporary_path)
        prompt_payload = {
            "required_fields": [
                "name", "customer_name", "parties(role/name/contact)",
                "contract_amount", "signed_date", "started_date",
                "planned_delivery_date", "project_type", "missing_fields", "notes",
            ],
            "instruction": (
                "仅依据合同文本生成建项草稿，缺失字段必须进入 missing_fields，不得编造。"
                "project_type 仅能选择 软件销售、正版化服务、正版化服务+软件销售。"
            ),
        }
        if document_text is not None:
            prompt_payload["document_text"] = document_text
        result = await LoggedLlmClient().call(
            project_id=None,
            scene="project_draft",
            prompt=json.dumps(prompt_payload, ensure_ascii=False),
            output_schema=ProjectDraftOutput,
            request_meta={"filename": safe_name},
        )
        logger.info("generated project draft filename=%s", safe_name)
        return result
    finally:
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass


def _serialize_summaries(
    rows: list[tuple[Summary, SummaryInput | None, str | None]],
) -> list[SummaryResponse]:
    summaries: dict[int, SummaryResponse] = {}
    for summary, summary_input, tracked_file_name in rows:
        response = summaries.get(summary.id)
        if response is None:
            response = SummaryResponse.model_validate(summary)
            summaries[summary.id] = response
        if summary_input is not None:
            response.inputs.append(
                SummaryInputResponse(
                    tracked_file_id=summary_input.tracked_file_id,
                    tracked_file_name=tracked_file_name,
                    file_version=summary_input.file_version,
                )
            )
    return list(summaries.values())


@router.post("/projects/{project_id}/summary", response_model=TaskCreatedResponse, status_code=202)
async def create_summary_task(
    project_id: int,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await require_project_role(session, project_id, user, {"manager", "implementer"})
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


@router.post(
    "/projects/{project_id}/summary/answers",
    response_model=SummaryAnswersTaskResponse,
    status_code=202,
)
async def create_summary_regeneration_task(
    project_id: int,
    body: SummaryAnswersRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await require_project_role(session, project_id, user, {"manager", "implementer"})
    if await session.get(Project, project_id) is None:
        raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")
    latest = await session.scalar(
        select(Summary)
        .where(Summary.project_id == project_id)
        .order_by(Summary.version_no.desc())
        .limit(1)
    )
    if latest is None:
        raise conflict("项目尚无总结，无法回填回答", code="SUMMARY_NOT_FOUND")

    pending = set(latest.pending_questions)
    accepted = [item.model_dump() for item in body.answers if item.question in pending]
    ignored = [item.question for item in body.answers if item.question not in pending]
    task = Task(
        project_id=project_id,
        task_type="summary_regeneration",
        status="pending",
        payload={
            "project_id": project_id,
            "base_summary_id": latest.id,
            "answers": accepted,
            "ignored_questions": ignored,
        },
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    background_tasks.add_task(AiTaskExecutor.run, task.id)
    logger.info(
        "created summary regeneration task task_id=%s project_id=%s accepted=%s ignored=%s",
        task.id,
        project_id,
        len(accepted),
        len(ignored),
    )
    return SummaryAnswersTaskResponse(
        task_id=task.id,
        accepted_questions=[item["question"] for item in accepted],
        ignored_questions=ignored,
    )


@router.get("/projects/{project_id}/summary", response_model=SummaryResponse)
async def latest_summary(
    project_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await require_project_role(session, project_id, user)
    if await session.get(Project, project_id) is None:
        raise not_found("项目不存在", code="PROJECT_NOT_FOUND")
    latest_id = (
        select(Summary.id)
        .where(Summary.project_id == project_id)
        .order_by(Summary.version_no.desc())
        .limit(1)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(Summary, SummaryInput, TrackedFile.name)
            .outerjoin(SummaryInput, SummaryInput.summary_id == Summary.id)
            .outerjoin(TrackedFile, TrackedFile.id == SummaryInput.tracked_file_id)
            .where(Summary.id == latest_id)
            .order_by(SummaryInput.id)
        )
    ).all()
    if not rows:
        raise not_found("项目尚无总结", code="SUMMARY_NOT_FOUND")
    return _serialize_summaries(rows)[0]


@router.get("/projects/{project_id}/summary/history", response_model=SummaryHistoryResponse)
async def summary_history(
    project_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await require_project_role(session, project_id, user)
    if await session.get(Project, project_id) is None:
        raise not_found("项目不存在", code="PROJECT_NOT_FOUND")
    rows = list(
        await session.execute(
            select(Summary, SummaryInput, TrackedFile.name)
            .outerjoin(SummaryInput, SummaryInput.summary_id == Summary.id)
            .outerjoin(TrackedFile, TrackedFile.id == SummaryInput.tracked_file_id)
            .where(Summary.project_id == project_id)
            .order_by(Summary.version_no.desc(), SummaryInput.id)
        )
    )
    return SummaryHistoryResponse(items=_serialize_summaries(rows))


async def _require_version_access(
    session: AsyncSession,
    version: str,
    user: User,
    allowed_roles: set[str] | None = None,
) -> FileVersion:
    """解析版本所属项目并校验访问权限。"""
    file_version = await session.get(FileVersion, version)
    if not file_version:
        raise not_found("版本不存在", code="VERSION_NOT_FOUND")
    project_id = await session.scalar(
        select(WorkspaceFile.project_id).where(WorkspaceFile.id == file_version.file_id)
    )
    if project_id is not None:
        await require_project_role(session, project_id, user, allowed_roles)
    return file_version


@router.post("/versions/{version}/extract", response_model=TaskCreatedResponse, status_code=202)
async def create_extract_task(
    version: str,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    file_version = await _require_version_access(
        session, version, user, {"manager", "implementer"}
    )
    if file_version.document_type not in {"contract", "invoice", "payment"}:
        raise conflict("该版本不是可识别的材料类型", code="NOT_CONTRACT_VERSION")
    task = Task(
        task_type="contract_recognition",
        status="pending",
        payload={"version": version, "document_type": file_version.document_type},
    )
    session.add(task)
    file_version.parse_status = "processing"
    await session.commit()
    await session.refresh(task)
    background_tasks.add_task(AiTaskExecutor.run, task.id)
    logger.info(
        "created extraction task task_id=%s version=%s document_type=%s",
        task.id,
        version,
        file_version.document_type,
    )
    return TaskCreatedResponse(task_id=task.id)


@router.get(
    "/versions/{version}/extract",
    response_model=ContractInfoResponse | InvoiceInfoResponse | PaymentInfoResponse,
)
async def get_extract(
    version: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    file_version = await _require_version_access(session, version, user)
    model_by_type = {
        "contract": ContractInfo,
        "invoice": InvoiceInfo,
        "payment": PaymentInfo,
    }
    model = model_by_type.get(file_version.document_type)
    if model is None:
        raise conflict("该版本不是可识别的材料类型", code="NOT_CONTRACT_VERSION")
    item = await session.scalar(select(model).where(model.version == version))
    if not item:
        raise not_found("该版本尚无识别结果", code="EXTRACTION_NOT_FOUND")
    response_by_type = {
        "contract": ContractInfoResponse,
        "invoice": InvoiceInfoResponse,
        "payment": PaymentInfoResponse,
    }
    return response_by_type[file_version.document_type].model_validate(item)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    task = await session.get(Task, task_id)
    if not task:
        raise not_found("任务不存在", code="TASK_NOT_FOUND")
    if task.project_id is not None:
        await require_project_role(session, task.project_id, user)
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
