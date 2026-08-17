import logging
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contract_info import ContractInfo
from app.models.file_version import FileVersion
from app.models.invoice_info import InvoiceInfo
from app.models.payment_info import PaymentInfo
from app.models.workspace_file import WorkspaceFile

logger = logging.getLogger(__name__)
MISSING_CONTRACT = "缺少已解析合同"
MISSING_TERMS = "合同缺少付款条款"
MISSING_TERM_DATE = "付款条款缺少计划日期"
MISSING_PAYMENT_CONTRACT = "付款单缺少合同号"


@dataclass(frozen=True)
class CollectionDocument:
    version: str
    kind: str
    amount: Decimal | None
    uploaded_at: datetime
    contract_no: str | None = None
    payment_terms: tuple[dict[str, str], ...] = ()


@dataclass(frozen=True)
class CollectionOverview:
    contract_amount: Decimal | None
    receivable_amount: Decimal | None
    received_amount: Decimal
    invoiced_amount: Decimal
    overdue_amount: Decimal | None
    collection_rate: Decimal | None
    data_status: str
    incomplete_reasons: tuple[str, ...]


async def load_collection_documents(session: AsyncSession, project_id: int) -> list[CollectionDocument]:
    documents = []
    for kind, model in (("contract", ContractInfo), ("invoice", InvoiceInfo), ("payment", PaymentInfo)):
        statement = (select(FileVersion.uploaded_at, model).select_from(WorkspaceFile)
            .join(FileVersion, FileVersion.file_id == WorkspaceFile.id)
            .join(model, model.version == FileVersion.version)
            .where(WorkspaceFile.project_id == project_id, FileVersion.parse_status == "parsed", WorkspaceFile.is_deleted == False))
        for uploaded_at, info in (await session.execute(statement)).all():
            documents.append(CollectionDocument(
                version=info.version, kind=kind, amount=info.amount, uploaded_at=uploaded_at,
                contract_no=getattr(info, "contract_no", None),
                payment_terms=tuple(getattr(info, "payment_terms", ()) or ()),
            ))
    logger.info("loaded collection documents project_id=%s count=%s", project_id, len(documents))
    return documents


def _parse_ratio(term: dict[str, str]) -> Decimal | None:
    raw = str(term.get("ratio", "")).strip()
    try:
        ratio = Decimal(raw.removesuffix("%").strip())
    except (InvalidOperation, ValueError):
        return None
    return ratio / Decimal("100") if raw.endswith("%") or ratio > 1 else ratio


def _parse_planned_date(term: dict[str, str]) -> date | None:
    raw = term.get("planned_date")
    try:
        return date.fromisoformat(str(raw)[:10]) if raw else None
    except ValueError:
        return None


def aggregate_collection_overview(documents: Iterable[CollectionDocument], today: date | None = None) -> CollectionOverview:
    current_date = today or date.today()
    unique = {(item.kind, item.version): item for item in documents}
    contracts = [item for item in unique.values() if item.kind == "contract"]
    contract = max(contracts, key=lambda item: (item.uploaded_at, item.version), default=None)
    invoices = [item for item in unique.values() if item.kind == "invoice"]
    payments = [item for item in unique.values() if item.kind == "payment"]
    reasons = []
    if contract is None:
        reasons.append(MISSING_CONTRACT)
    elif not contract.payment_terms:
        reasons.append(MISSING_TERMS)
    elif any(_parse_planned_date(term) is None for term in contract.payment_terms):
        reasons.append(MISSING_TERM_DATE)
    if any(not item.contract_no for item in payments):
        reasons.append(MISSING_PAYMENT_CONTRACT)
    contract_amount = contract.amount if contract else None
    received = sum((item.amount or Decimal("0") for item in payments), Decimal("0"))
    invoiced = sum((item.amount or Decimal("0") for item in invoices), Decimal("0"))
    receivable = None
    if contract and contract.payment_terms and MISSING_TERM_DATE not in reasons:
        receivable = sum(((contract_amount or Decimal("0")) * (_parse_ratio(term) or Decimal("0"))
            for term in contract.payment_terms
            if (_parse_planned_date(term) or date.max) <= current_date), Decimal("0"))
    overdue = max(receivable - received, Decimal("0")) if receivable is not None else None
    rate = ((received / contract_amount).quantize(Decimal("0.0001"))
        if contract_amount is not None and contract_amount != 0 else None)
    return CollectionOverview(contract_amount, receivable, received, invoiced, overdue, rate,
        "incomplete" if reasons else "ok", tuple(dict.fromkeys(reasons)))
