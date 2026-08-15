import hashlib
import json
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol, TypeVar

from pydantic import BaseModel

from app.db.session import AsyncSessionLocal
from app.models.llm_call import LlmCall
from app.schemas.ai import (
    ContractExtractionOutput,
    InvoiceExtractionOutput,
    PaymentExtractionOutput,
    SummaryGenerationOutput,
)
from app.schemas.copilot import CopilotAnswerOutput

T = TypeVar("T", bound=BaseModel)


@dataclass(frozen=True)
class ProviderResult:
    data: dict
    input_tokens: int
    output_tokens: int
    cost: Decimal


class LlmProvider(Protocol):
    name: str
    model_name: str

    async def generate(self, prompt: str, output_schema: type[T]) -> ProviderResult: ...


class MockLlmProvider:
    name = "mock"
    model_name = "mock-structured-v1"

    async def generate(self, prompt: str, output_schema: type[T]) -> ProviderResult:
        if output_schema is ContractExtractionOutput:
            data = {
                "contract_no": "MOCK-CONTRACT-001",
                "party_a": "示例甲方",
                "party_b": "示例乙方",
                "amount": "100000.00",
                "signed_date": "2026-08-10",
                "payment_terms": [{"stage": "验收", "ratio": "100%"}],
                "missing_fields": [],
            }
        elif output_schema is InvoiceExtractionOutput:
            data = {
                "invoice_no": "MOCK-INVOICE-001",
                "issued_date": "2026-08-11",
                "amount": "106000.00",
                "tax_amount": "6000.00",
                "tax_rate": "0.06",
                "buyer": "示例购买方",
                "seller": "示例销售方",
                "missing_fields": [],
            }
        elif output_schema is PaymentExtractionOutput:
            data = {
                "amount": "100000.00",
                "payment_date": "2026-08-12",
                "payer": "示例付款方",
                "contract_no": "MOCK-CONTRACT-001",
                "remarks": "合同款已到账",
                "missing_fields": [],
            }
        elif output_schema is SummaryGenerationOutput:
            try:
                prompt_data = json.loads(prompt)
            except json.JSONDecodeError:
                prompt_data = {}
            answers = prompt_data.get("question_answers") or []
            previous = prompt_data.get("previous_summary") or {}
            pending = (
                previous["pending_questions"]
                if "pending_questions" in previous
                else ["是否仍有缺失材料？", "项目当前进度如何？"]
            )
            answered_questions = {item["question"] for item in answers}
            previous_answers = previous.get("core_info", {}).get("answered_questions", [])
            answer_history = [
                *previous_answers,
                *[
                    {"question": item["question"], "answer": item["answer"]}
                    for item in answers
                ],
            ]
            answer_points = "；".join(
                f"{item['question']} {item['answer']}" for item in answers
            )
            data = {
                "core_info": {
                    "summary": "项目资料已完成 mock 汇总",
                    "answered_questions": answer_history,
                },
                "contract_invoice_progress": {
                    "contract": "已收集合同资料",
                    "invoice": "待确认开票情况",
                    "payment": "待确认回款情况",
                },
                "missing_materials": [],
                "pending_questions": [q for q in pending if q not in answered_questions],
                "content": "核心信息已汇总；合同资料已收集，开票与回款进度待确认。"
                + (f" 已回填信息：{answer_points}。" if answer_points else ""),
            }
        elif output_schema is CopilotAnswerOutput:
            try:
                prompt_data = json.loads(prompt)
            except json.JSONDecodeError:
                prompt_data = {}
            projects = prompt_data.get("projects") or []
            priority = [item for item in projects if item.get("risk_level") in {"block", "warn"}]
            selected = priority or projects
            references = []
            descriptions = []
            for item in selected:
                identifier = f"项目 {item.get('code') or item.get('id')}"
                risks = item.get("risks") or []
                reasons = [risk.get("reason") for risk in risks if risk.get("reason")]
                summary = item.get("latest_summary") or {}
                if reasons:
                    detail = "；".join(reasons)
                    references.extend(f"{identifier}：{reason}" for reason in reasons)
                elif summary.get("content"):
                    detail = summary["content"]
                    references.append(f"{identifier}：{detail}")
                else:
                    detail = f"风险等级为 {item.get('risk_level', 'ok')}"
                    references.append(f"{identifier}：{detail}")
                descriptions.append(f"{identifier}（{detail}）")
            counts = prompt_data.get("risk_level_counts") or {}
            prefix = (
                f"当前共 {len(projects)} 个项目，阻塞 {counts.get('block', 0)} 个、"
                f"预警 {counts.get('warn', 0)} 个、正常 {counts.get('ok', 0)} 个。"
            )
            recommendation = (
                "建议优先复核" + "，".join(descriptions) + "。"
                if descriptions
                else "暂无可复核项目。"
            )
            data = {
                "answer": prefix + recommendation,
                "references": references,
            }
        else:
            raise ValueError(f"不支持输出类型 {output_schema.__name__}")
        text = json.dumps(data, ensure_ascii=False)
        return ProviderResult(
            data, max(1, len(prompt) // 4), max(1, len(text) // 4), Decimal("0")
        )


class LoggedLlmClient:
    def __init__(self, provider: LlmProvider | None = None):
        self.provider = provider or MockLlmProvider()

    async def call(
        self,
        *,
        task_id: int | None = None,
        project_id: int | None = None,
        scene: str,
        prompt: str,
        output_schema: type[T],
        request_meta: dict | None = None,
    ) -> T:
        started = time.perf_counter()
        call = LlmCall(
            task_id=task_id,
            project_id=project_id,
            provider=self.provider.name,
            model_name=self.provider.model_name,
            scene=scene,
            prompt_hash=hashlib.sha256(prompt.encode()).hexdigest(),
            input_tokens=0,
            output_tokens=0,
            cost=Decimal("0"),
            latency_ms=0,
            success=False,
            request_meta={"output_schema": output_schema.__name__, **(request_meta or {})},
        )
        try:
            result = await self.provider.generate(prompt, output_schema)
            output = output_schema.model_validate(result.data)
            call.input_tokens, call.output_tokens, call.cost = (
                result.input_tokens,
                result.output_tokens,
                result.cost,
            )
            call.success = True
            return output
        except Exception as exc:
            call.error_message = str(exc)[:4000]
            raise
        finally:
            call.latency_ms = max(0, int((time.perf_counter() - started) * 1000))
            async with AsyncSessionLocal() as session:
                session.add(call)
                await session.commit()
