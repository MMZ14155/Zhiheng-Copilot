from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.models.project import Project
from app.schemas.risks import RiskConfig, RiskItem, RiskRuleSwitches, RiskThresholds


@dataclass(frozen=True)
class DeliverableRiskState:
    name: str
    category: str
    required: bool
    status: str
    unfrozen_versions: int
    extensions: tuple[str, ...] = ()
    document_types: tuple[str, ...] = ()
    payment_status: str | None = None


@dataclass(frozen=True)
class PaymentRiskState:
    contract_amount: Decimal = Decimal("0")
    invoiced_amount: Decimal = Decimal("0")
    received_amount: Decimal = Decimal("0")
    receivable_amount: Decimal = Decimal("0")
    overdue_amount: Decimal = Decimal("0")
    overdue_days: int = 0
    data_incomplete: bool = False
    incomplete_reasons: tuple[str, ...] = ()


def get_default_risk_config(project_id: int | str) -> RiskConfig:
    return RiskConfig(
        project_id=str(project_id),
        enabled_rules=RiskRuleSwitches(),
        thresholds=RiskThresholds(),
    )


def load_risk_config(project: Project) -> RiskConfig:
    if project.risk_config is None:
        return get_default_risk_config(project.id)
    return RiskConfig.model_validate({**project.risk_config, "projectId": str(project.id)})


def _number(value: Decimal | int | None) -> str:
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    return str(value)


def _payment_collection_status(items: list[DeliverableRiskState]) -> str:
    if not items:
        return "未付款"
    paid_names = {
        item.name
        for item in items
        if item.payment_status == "已付款"
    }
    if "全款" in paid_names:
        return "已付全款"
    if "首款" in paid_names and "尾款" in paid_names:
        return "已付全款"
    if "首款" in paid_names:
        return "已付首款"
    return "未付款"


def evaluate_project(
    project: Project,
    deliverables: list[DeliverableRiskState],
    config: RiskConfig,
    payment: PaymentRiskState | None = None,
    today: date | None = None,
) -> list[RiskItem]:
    risks: list[RiskItem] = []
    thresholds = config.thresholds

    if config.enabled_rules.material_missing:
        contract_items = [item for item in deliverables if item.category == "合同"]
        missing_parts: list[str] = []
        extensions = {
            ext.lower()
            for item in contract_items
            for ext in item.extensions
        }
        if not any(ext in (".doc", ".docx") for ext in extensions):
            missing_parts.append("doc合同")
        if ".pdf" not in extensions:
            missing_parts.append("pdf合同")
        has_invoice = any(
            "invoice" in (item.document_types or ())
            or "发票" in item.name
            for item in contract_items
        )
        if not has_invoice:
            missing_parts.append("发票不全")
        if missing_parts:
            risks.append(RiskItem(
                type="material-missing", level="warn",
                missing_parts=missing_parts,
                reason="项目材料缺失：" + "、".join(missing_parts) + "。",
                recommendation="补齐缺失的合同与发票文件，并冻结有效版本。",
            ))

    current_date = today or date.today()
    delivery_date = getattr(project, "planned_delivery_date", None)
    project_status = getattr(project, "status", "active")
    if (config.enabled_rules.delivery_warning and delivery_date is not None
            and project_status not in {"项目结项"}):
        remaining_days = (delivery_date - current_date).days
        if remaining_days <= thresholds.delivery_warn_days:
            dismissed = getattr(project, "delivery_warning_dismissed", False)
            risks.append(RiskItem(
                type="delivery-warning", level="warn", remaining_days=remaining_days,
                dismissed=dismissed,
                reason=f"距计划交付仅剩 {remaining_days} 天，计划交付日期为 {delivery_date.isoformat()}。",
                recommendation="倒排里程碑并按周跟踪关键节点，提前处理交付阻塞。",
            ))

    if config.enabled_rules.payment_uncleared:
        payment_items = [item for item in deliverables if item.category == "回款"]
        status = _payment_collection_status(payment_items)
        if status != "已付全款":
            risks.append(RiskItem(
                type="payment-uncleared", level="warn", payment_status=status,
                reason=f"项目回款未结清，当前状态：{status}。",
                recommendation="核对回款计划并及时跟进未付款项。",
            ))

    return risks


def aggregate_risk(risks: list[RiskItem]) -> str:
    return "warn" if risks else "ok"
