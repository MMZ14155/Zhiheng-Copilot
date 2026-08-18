import json
import logging
from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import func, select

from app.core.config import Settings, get_settings
from app.db.session import AsyncSessionLocal
from app.models.contract_info import ContractInfo
from app.models.file_version import FileVersion
from app.models.invoice_info import InvoiceInfo
from app.models.payment_info import PaymentInfo
from app.models.project import Project
from app.models.summary import Summary
from app.models.summary_input import SummaryInput
from app.models.task import Task
from app.models.tracked_file import TrackedFile
from app.schemas.ai import (
    ContractExtractionOutput,
    InvoiceExtractionOutput,
    PaymentExtractionOutput,
    SummaryGenerationOutput,
)
from app.services.llm import LoggedLlmClient
from app.services.llm_kimi import KimiFileContentExtractor
from app.services.settings_store import get_effective_llm_settings

logger = logging.getLogger(__name__)


class FileContentExtractor(Protocol):
    async def extract_text(self, file_path: str) -> str | None: ...


class NullFileContentExtractor:
    async def extract_text(self, file_path: str) -> str | None:
        return None


def create_file_content_extractor(settings: Settings | None = None) -> FileContentExtractor:
    effective = get_effective_llm_settings(settings or get_settings())
    if effective.provider.lower() == "kimi" and effective.api_key:
        return KimiFileContentExtractor(
            api_key=effective.api_key,
            base_url=effective.base_url,
            timeout_seconds=effective.timeout_seconds,
        )
    return NullFileContentExtractor()


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
                elif task.task_type == "summary_regeneration":
                    await AiTaskExecutor._summary(session, task, regenerate=True)
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
    async def _summary(session, task: Task, regenerate: bool = False) -> None:
        project = await session.scalar(
            select(Project).where(Project.id == task.project_id).with_for_update()
        )
        if not project:
            raise ValueError("项目不存在")
        previous = None
        answers = task.payload.get("answers", []) if regenerate else []
        if regenerate:
            previous = await session.get(Summary, task.payload.get("base_summary_id"))
            if previous is None or previous.project_id != project.id:
                raise ValueError("回填所基于的总结不存在")
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
                "previous_summary": (
                    {
                        "version_no": previous.version_no,
                        "core_info": previous.core_info,
                        "contract_invoice_progress": previous.contract_invoice_progress,
                        "missing_materials": previous.missing_materials,
                        "pending_questions": previous.pending_questions,
                        "content": previous.content,
                    }
                    if previous
                    else None
                ),
                "question_answers": answers,
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
        extraction_config = {
            "contract": (
                ContractExtractionOutput,
                ContractInfo,
                "contract_extraction",
                ["合同编号", "甲乙方", "金额", "签署日期", "付款条款"],
            ),
            "invoice": (
                InvoiceExtractionOutput,
                InvoiceInfo,
                "invoice_extraction",
                ["发票号码", "开票日期", "金额", "税额", "税率", "购买方", "销售方"],
            ),
            "payment": (
                PaymentExtractionOutput,
                PaymentInfo,
                "payment_extraction",
                ["回款金额", "回款日期", "付款方", "对应合同编号", "备注"],
            ),
        }
        config = extraction_config.get(version.document_type)
        if config is None:
            raise ValueError(f"不支持识别的材料类型 {version.document_type}")
        output_schema, model, scene, required_fields = config
        extractor = create_file_content_extractor()
        document_text = await extractor.extract_text(version.storage_path)
        prompt_payload = {
            "version": version.version,
            "document_type": version.document_type,
            "content_hash": version.content_hash,
            "required_fields": required_fields,
        }
        if document_text is not None:
            prompt_payload["document_text"] = document_text
            prompt_payload["instruction"] = (
                "仅依据 document_text 抽取，缺失字段进 missing_fields，不得编造"
            )
            logger.info(
                "injecting document text into extraction prompt version=%s text_length=%s",
                version.version,
                len(document_text),
            )
        prompt = json.dumps(prompt_payload, ensure_ascii=False)
        out = await LoggedLlmClient().call(
            task_id=task.id,
            scene=scene,
            prompt=prompt,
            output_schema=output_schema,
            request_meta={"file_version": version.version, "document_type": version.document_type},
        )
        info = await session.scalar(
            select(model).where(model.version == version.version)
        )
        if not info:
            info = model(version=version.version)
            session.add(info)
        for field, value in out.model_dump(mode="python").items():
            setattr(info, field, value)
        info.raw_output = out.model_dump(mode="json")
        version.parse_status = "parsed"
