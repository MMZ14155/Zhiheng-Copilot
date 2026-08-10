import json
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models.contract_info import ContractInfo
from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.summary import Summary
from app.models.summary_input import SummaryInput
from app.models.task import Task
from app.models.tracked_file import TrackedFile
from app.schemas.ai import ContractExtractionOutput, SummaryGenerationOutput
from app.services.llm import LoggedLlmClient

logger = logging.getLogger(__name__)


class AiTaskExecutor:
    @staticmethod
    async def run(task_id: int) -> None:
        async with AsyncSessionLocal() as session:
            task = await session.get(Task, task_id)
            if task is None or task.status != "pending":
                return
            task.status, task.started_at = "running", datetime.now(timezone.utc)
            await session.commit()
            try:
                if task.task_type == "summary_generation":
                    await AiTaskExecutor._summary(session, task)
                elif task.task_type == "contract_recognition":
                    await AiTaskExecutor._extract(session, task)
                else:
                    raise ValueError(f"不支持的任务类型 {task.task_type}")
                task.status, task.finished_at = "completed", datetime.now(timezone.utc)
                await session.commit()
                logger.info("completed AI task task_id=%s", task_id)
            except Exception as exc:
                await session.rollback()
                task = await session.get(Task, task_id)
                if task:
                    task.status, task.failure_reason, task.finished_at = (
                        "failed",
                        str(exc)[:4000],
                        datetime.now(timezone.utc),
                    )
                    if task.task_type == "contract_recognition":
                        version = await session.get(FileVersion, task.payload.get("version"))
                        if version:
                            version.parse_status = "failed"
                    await session.commit()
                logger.exception("AI task failed task_id=%s", task_id)

    @staticmethod
    async def _summary(session, task: Task) -> None:
        project = await session.scalar(
            select(Project).where(Project.id == task.project_id).with_for_update()
        )
        if not project:
            raise ValueError("项目不存在")
        tracked = list(
            (
                await session.execute(
                    select(TrackedFile)
                    .where(TrackedFile.project_id == project.id)
                    .order_by(TrackedFile.id)
                )
            ).scalars()
        )
        number = (
            await session.scalar(
                select(func.coalesce(func.max(Summary.version_no), 0)).where(
                    Summary.project_id == project.id
                )
            )
        ) + 1
        summary = Summary(
            project_id=project.id,
            version_no=number,
            core_info={},
            contract_invoice_progress={},
            missing_materials=[],
            pending_questions=[],
            created_by="mock-structured-v1",
        )
        session.add(summary)
        await session.flush()
        for item in tracked:
            if item.current_version:
                session.add(
                    SummaryInput(
                        summary_id=summary.id,
                        tracked_file_id=item.id,
                        file_version=item.current_version,
                    )
                )
        await session.flush()
        prompt = json.dumps(
            {
                "project": {
                    "id": project.id,
                    "name": project.name,
                    "progress": project.progress,
                    "notes": project.notes,
                },
                "deliverables": [
                    {
                        "id": x.id,
                        "name": x.name,
                        "category": x.category,
                        "required": x.required,
                        "current_version": x.current_version,
                    }
                    for x in tracked
                ],
                "requirements": ["核心信息", "合同发票回款进度", "缺失材料", "询问材料与项目进度"],
            },
            ensure_ascii=False,
            default=str,
        )
        out = await LoggedLlmClient().call(
            task_id=task.id,
            scene="project_summary",
            prompt=prompt,
            output_schema=SummaryGenerationOutput,
            request_meta={"project_id": project.id, "summary_id": summary.id},
        )
        summary.core_info, summary.contract_invoice_progress = (
            out.core_info,
            out.contract_invoice_progress,
        )
        summary.missing_materials, summary.pending_questions, summary.content = (
            out.missing_materials,
            out.pending_questions,
            out.content,
        )
        task.payload = {**task.payload, "summary_id": summary.id, "version_no": number}

    @staticmethod
    async def _extract(session, task: Task) -> None:
        version = await session.get(FileVersion, task.payload["version"])
        if not version:
            raise ValueError("版本不存在")
        prompt = json.dumps(
            {
                "version": version.version,
                "document_type": version.document_type,
                "content_hash": version.content_hash,
                "required_fields": ["合同编号", "甲乙方", "金额", "期限", "付款条款"],
            },
            ensure_ascii=False,
        )
        out = await LoggedLlmClient().call(
            task_id=task.id,
            scene="contract_extraction",
            prompt=prompt,
            output_schema=ContractExtractionOutput,
            request_meta={"file_version": version.version},
        )
        info = await session.scalar(
            select(ContractInfo).where(ContractInfo.version == version.version)
        )
        if not info:
            info = ContractInfo(version=version.version)
            session.add(info)
        info.contract_no, info.party_a, info.party_b, info.amount, info.signed_date = (
            out.contract_no,
            out.party_a,
            out.party_b,
            out.amount,
            out.signed_date,
        )
        info.payment_terms, info.missing_fields, info.raw_output = (
            out.payment_terms,
            out.missing_fields,
            out.model_dump(mode="json"),
        )
        version.parse_status = "parsed"
