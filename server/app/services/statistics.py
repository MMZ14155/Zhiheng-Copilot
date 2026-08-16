import re
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.contract_info import ContractInfo
from app.models.file_version import FileVersion
from app.models.invoice_info import InvoiceInfo
from app.models.payment_info import PaymentInfo
from app.models.workspace_file import WorkspaceFile
from app.schemas.statistics import AverageMetric, StageStatistics
from app.services.risk_monitor import PaymentRiskState


@dataclass(frozen=True)
class FinancialDocument:
    project_id: int
    file_id: int
    version: str
    kind: str
    amount: Decimal | None
    created_at: object
    contract_no: str | None = None
    signed_date: date | None = None
    payment_date: date | None = None
    payment_terms: tuple[dict[str, str], ...] = ()


async def load_financial_documents(
    session: AsyncSession, project_ids: list[int] | None = None,
) -> dict[int, list[FinancialDocument]]:
    grouped: dict[int, list[FinancialDocument]] = defaultdict(list)
    for kind, model in (("contract", ContractInfo), ("invoice", InvoiceInfo), ("payment", PaymentInfo)):
        statement = (
            select(WorkspaceFile.project_id, FileVersion.file_id, FileVersion.uploaded_at, model)
            .join(FileVersion, FileVersion.file_id == WorkspaceFile.id)
            .join(model, model.version == FileVersion.version)
            .where(FileVersion.parse_status == "parsed")
        )
        if project_ids is not None:
            statement = statement.where(WorkspaceFile.project_id.in_(project_ids))
        rows = (await session.execute(statement)).all()
        for row in rows:
            if len(row) != 4:
                continue
            project_id, file_id, uploaded_at, info = row
            grouped[project_id].append(FinancialDocument(
                project_id=project_id, file_id=file_id, version=info.version, kind=kind,
                amount=info.amount, created_at=uploaded_at,
                contract_no=getattr(info, "contract_no", None),
                signed_date=getattr(info, "signed_date", None),
                payment_date=getattr(info, "payment_date", None),
                payment_terms=tuple(getattr(info, "payment_terms", ()) or ()),
            ))
    return grouped


def _term_due_date(term: dict[str, str], signed_date: date | None) -> date | None:
    for key in ("due_date", "dueDate", "date", "payment_date", "paymentDate"):
        value = term.get(key)
        if value:
            try:
                return date.fromisoformat(str(value)[:10])
            except ValueError:
                return None
    stage = str(term.get("stage", ""))
    match = re.search(r"\d{4}-\d{2}-\d{2}", stage)
    if match:
        try:
            return date.fromisoformat(match.group())
        except ValueError:
            return None
    return signed_date if signed_date and "签" in stage else None


def _term_ratio(term: dict[str, str]) -> Decimal | None:
    raw = str(term.get("ratio", "")).strip()
    try:
        ratio = Decimal(raw.rstrip("%"))
    except (InvalidOperation, ValueError):
        return None
    return ratio / Decimal("100") if raw.endswith("%") or ratio > 1 else ratio


def aggregate_project_finance(
    documents: Iterable[FinancialDocument], today: date | None = None,
) -> PaymentRiskState:
    current_date = today or date.today()
    unique: dict[tuple[str, str], FinancialDocument] = {}
    duplicate = False
    for document in documents:
        key = (document.kind, document.version)
        if key in unique:
            duplicate = True
            continue
        unique[key] = document

    contracts_by_file: dict[int, FinancialDocument] = {}
    for document in unique.values():
        if document.kind == "contract":
            previous = contracts_by_file.get(document.file_id)
            if previous is None or (str(document.created_at), document.version) > (
                str(previous.created_at), previous.version
            ):
                contracts_by_file[document.file_id] = document
    contracts = list(contracts_by_file.values())
    invoices = [item for item in unique.values() if item.kind == "invoice"]
    payments = [item for item in unique.values() if item.kind == "payment"]
    reasons: list[str] = []
    if duplicate:
        reasons.append("存在重复版本单据")
    if not contracts:
        reasons.append("缺少已解析合同")
    if any(not item.contract_no for item in payments):
        reasons.append("回款单据缺少合同号")
    contract_numbers = {item.contract_no for item in contracts if item.contract_no}
    if any(item.contract_no and item.contract_no not in contract_numbers for item in payments):
        reasons.append("回款单据合同号无法匹配")
    if any(item.amount is None for item in contracts + invoices + payments):
        reasons.append("单据金额缺失")

    contract_amount = sum((item.amount or Decimal("0") for item in contracts), Decimal("0"))
    invoiced_amount = sum((item.amount or Decimal("0") for item in invoices), Decimal("0"))
    received_amount = sum((item.amount or Decimal("0") for item in payments), Decimal("0"))
    receivable_amount = Decimal("0")
    oldest_due: date | None = None
    for contract in contracts:
        if not contract.payment_terms:
            reasons.append("合同缺少付款条款")
            continue
        for term in contract.payment_terms:
            ratio = _term_ratio(term)
            due_date = _term_due_date(term, contract.signed_date)
            if ratio is None or due_date is None:
                reasons.append("付款条款节点无法计算")
                continue
            if due_date <= current_date:
                receivable_amount += (contract.amount or Decimal("0")) * ratio
                oldest_due = due_date if oldest_due is None else min(oldest_due, due_date)
    overdue_amount = max(receivable_amount - received_amount, Decimal("0"))
    overdue_days = (current_date - oldest_due).days if overdue_amount and oldest_due else 0
    return PaymentRiskState(
        contract_amount=contract_amount, invoiced_amount=invoiced_amount,
        received_amount=received_amount, receivable_amount=receivable_amount,
        overdue_amount=overdue_amount, overdue_days=overdue_days,
        data_incomplete=bool(reasons), incomplete_reasons=tuple(dict.fromkeys(reasons)),
    )


def _average(values: Iterable[Decimal]) -> AverageMetric:
    samples = list(values)
    return AverageMetric(
        value=round(float(sum(samples) / len(samples)), 2) if samples else None,
        sample_count=len(samples),
    )


def project_averages(projects: Iterable[Project]) -> tuple[AverageMetric, AverageMetric, AverageMetric]:
    items = list(projects)
    cost = _average(
        project.cost / project.budget * 100
        for project in items
        if project.cost is not None and project.budget is not None and project.budget > 0
    )
    schedule = _average(
        Decimal(project.used_days) / Decimal(project.planned_days) * 100
        for project in items
        if project.used_days is not None
        and project.planned_days is not None
        and project.planned_days > 0
    )
    satisfaction = _average(
        project.satisfaction for project in items if project.satisfaction is not None
    )
    return cost, schedule, satisfaction


def group_by_stage(projects: Iterable[Project]) -> list[StageStatistics]:
    grouped: dict[str | None, list[Project]] = defaultdict(list)
    for project in projects:
        grouped[project.stage].append(project)

    result = []
    for stage in sorted(grouped, key=lambda value: (value is None, value or "")):
        items = grouped[stage]
        cost, schedule, satisfaction = project_averages(items)
        result.append(
            StageStatistics(
                stage=stage,
                count=len(items),
                average_cost_usage_rate=cost,
                average_schedule_usage_rate=schedule,
                average_satisfaction=satisfaction,
            )
        )
    return result


def empty_status_counts() -> Counter[str]:
    return Counter({"missing": 0, "old": 0, "conflict": 0, "ok": 0})
