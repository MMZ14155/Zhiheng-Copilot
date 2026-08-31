import asyncio
import json
import logging
import os
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
    ProjectDraftOutput,
    SummaryGenerationOutput,
)
from app.services.llm import LoggedLlmClient
from app.services.llm_kimi import KimiFileContentExtractor
from app.services.settings_store import get_effective_llm_settings

logger = logging.getLogger(__name__)

EXTRACTABLE_DOCUMENT_TYPES = {"contract", "invoice", "payment"}


async def create_extraction_task(
    session, version: FileVersion, version_hash: str | None = None
) -> Task | None:
    """为可识别文件版本创建任务，任务与版本状态由调用方一并提交。"""
    if version.document_type not in EXTRACTABLE_DOCUMENT_TYPES:
        version.parse_status = "skipped"
        return None
    task = Task(
        task_type="contract_recognition",
        status="pending",
        payload={
            "version": version_hash or version.version,
            "document_type": version.document_type,
        },
    )
    session.add(task)
    version.parse_status = "processing"
    await session.flush()
    if task.id is None:
        await session.refresh(task)
    logger.info(
        "created extraction task task_id=%s version=%s document_type=%s",
        task.id,
        version_hash or version.version,
        version.document_type,
    )
    return task


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
            await AiTaskExecutor._set_stage(session, task, "running", 0)
            try:
                if task.task_type == "summary_generation":
                    await AiTaskExecutor._summary(session, task)
                elif task.task_type == "summary_regeneration":
                    await AiTaskExecutor._summary(session, task, regenerate=True)
                elif task.task_type == "contract_recognition":
                    await AiTaskExecutor._extract(session, task)
                elif task.task_type == "project_draft":
                    await AiTaskExecutor._project_draft(session, task)
                else:
                    raise ValueError(f"不支持的任务类型 {task.task_type}")
                task.status, task.finished_at = "completed", datetime.now(timezone.utc)
                await session.commit()
                logger.info("completed AI task task_id=%s", task_id)
            except Exception as exc:
                await session.rollback()
                task = await session.get(Task, task_id)
                if task:
                    raw_output = getattr(exc, "raw_output", None)
                    failure_reason = str(exc)[:4000]
                    task.status, task.failure_reason, task.finished_at = (
                        "failed",
                        failure_reason,
                        datetime.now(timezone.utc),
                    )
                    if raw_output:
                        task.payload = {
                            **task.payload,
                            "raw_output": raw_output[:2000],
                        }
                    if task.task_type == "contract_recognition":
                        version = await session.get(FileVersion, task.payload.get("version"))
                        if version:
                            version.parse_status = "failed"
                    await session.commit()
                logger.exception("AI task failed task_id=%s", task_id)

    @staticmethod
    async def _set_stage(
        session, task: Task, stage: str, progress: int | None = None
    ) -> None:
        task.payload = {
            **task.payload,
            "stage": stage,
            **({"progress": progress} if progress is not None else {}),
        }
        await session.commit()
        logger.info("task stage updated task_id=%s stage=%s progress=%s", task.id, stage, progress)

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
        await AiTaskExecutor._set_stage(session, task, "analyzing", 50)
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
        await AiTaskExecutor._set_stage(session, task, "completed", 100)

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
                ["contract_no", "party_a", "party_b", "amount", "signed_date", "payment_terms"],
            ),
            "invoice": (
                InvoiceExtractionOutput,
                InvoiceInfo,
                "invoice_extraction",
                ["invoice_no", "issued_date", "amount", "tax_amount", "tax_rate", "buyer", "seller"],
            ),
            "payment": (
                PaymentExtractionOutput,
                PaymentInfo,
                "payment_extraction",
                ["amount", "payment_date", "payer", "contract_no", "remarks"],
            ),
        }
        config = extraction_config.get(version.document_type)
        if config is None:
            raise ValueError(f"不支持识别的材料类型 {version.document_type}")
        output_schema, model, scene, required_fields = config
        extractor = create_file_content_extractor()
        await AiTaskExecutor._set_stage(session, task, "extracting", 30)
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
                "仅依据 document_text 抽取，输出必须是可被 json.loads 直接解析的纯 JSON 对象，不要 Markdown 代码块，不要任何解释。"
                "JSON 键名必须严格使用 required_fields 中的键名，缺失字段进 missing_fields，不得编造。"
                "格式要求：日期统一为 YYYY-MM-DD（如 2026-08-25）；"
                "金额只输出数字（如 1995.00），不要货币符号、千分位或文字说明；"
                "税率只输出小数（如 0.06），不要百分号；"
                "payment_terms 中每个对象必须包含 stage 和 ratio 两个字符串键。"
                "如果某项信息在文本中无法确认，必须将其放入 missing_fields，不要猜测。"
            )
            logger.info(
                "injecting document text into extraction prompt version=%s text_length=%s",
                version.version,
                len(document_text),
            )
        await AiTaskExecutor._set_stage(session, task, "generating", 80)
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
        await AiTaskExecutor._set_stage(session, task, "completed", 100)

    @staticmethod
    async def _project_draft(session, task: Task) -> None:
        payload = task.payload
        files = payload.get("files", [])
        if not files:
            raise ValueError("任务缺少待分析文件")
        extractor = create_file_content_extractor()
        if isinstance(extractor, NullFileContentExtractor):
            raise ValueError("未配置可用的文件内容提取器")

        await AiTaskExecutor._set_stage(session, task, "extracting", 10)

        async def _extract_one(item: dict) -> dict:
            path = item["path"]
            name = item["name"]
            try:
                text = await extractor.extract_text(path)
            except Exception as exc:
                logger.warning("project draft extract failed path=%s error=%s", path, exc)
                text = None
            return {"name": name, "text": text or ""}

        try:
            documents = await asyncio.gather(*[_extract_one(f) for f in files])
            await AiTaskExecutor._set_stage(session, task, "generating", 60)
            prompt_payload = {
                "required_fields": [
                    "name", "customer_name", "parties(role/name/contact)",
                    "contract_amount", "signed_date", "started_date",
                    "planned_delivery_date", "project_type", "missing_fields", "notes",
                ],
                "instruction": (
                    "仅依据提供的合同文本生成建项草稿。"
                    "输出必须是可被 json.loads 直接解析的纯 JSON 对象，不要 Markdown 代码块，不要任何解释。"
                    "缺失字段必须进入 missing_fields 数组，不得编造。"
                    "project_type 只能为 软件销售、正版化服务、正版化服务+软件销售 之一，无法确认时留空。"
                    "日期统一为 YYYY-MM-DD（如 2026-08-25），金额只输出纯数字（如 1995.00），不要货币符号、千分位或中文说明。"
                    "parties 中每个对象必须包含 role、name、contact 三个键，contact 无法确认时置 null。"
                    "当提供多份合同时，以主合同为准，其他材料作为补充。"
                ),
                "documents": documents,
            }
            prompt = json.dumps(prompt_payload, ensure_ascii=False)
            out = await LoggedLlmClient().call(
                task_id=task.id,
                scene="project_draft",
                prompt=prompt,
                output_schema=ProjectDraftOutput,
                request_meta={"files": [f["name"] for f in files]},
            )
            await AiTaskExecutor._set_stage(session, task, "completed", 100)
            task.payload = {**payload, "result": out.model_dump(mode="json")}
        finally:
            for item in files:
                path = item.get("path")
                if path and os.path.exists(path):
                    try:
                        os.unlink(path)
                    except OSError as exc:
                        logger.warning("cleanup temp file failed path=%s error=%s", path, exc)
