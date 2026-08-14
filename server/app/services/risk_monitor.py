from dataclasses import dataclass
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


def evaluate_project(
    project: Project,
    deliverables: list[DeliverableRiskState],
    config: RiskConfig,
) -> list[RiskItem]:
    risks: list[RiskItem] = []
    thresholds = config.thresholds

    # The reference implementation makes schedule mandatory, regardless of its switch.
    if project.planned_days is not None and project.used_days is not None:
        ratio = project.used_days / project.planned_days if project.planned_days > 0 else 0
        if ratio > thresholds.schedule_block:
            risks.append(RiskItem(
                type="schedule-overrun", level="block",
                reason=f"项目已超期：已用 {project.used_days} 天，超过计划 {project.planned_days} 天，进度使用率 {ratio * 100:.1f}%。",
                recommendation="立即评估剩余工作量，协调资源赶工或与客户协商调整验收计划。",
            ))
        elif ratio > thresholds.schedule_warn:
            risks.append(RiskItem(
                type="schedule-overrun", level="warn",
                reason=f"项目临近超期：已用 {project.used_days} 天，计划 {project.planned_days} 天，进度使用率 {ratio * 100:.1f}%。",
                recommendation="梳理关键路径，确认剩余任务资源投入，提前触发预警沟通。",
            ))
        remaining = project.planned_days - project.used_days
        if remaining < 90:
            risks.append(RiskItem(
                type="schedule-remaining", level="warn",
                reason=f"项目结束时间不足90天（剩余 {remaining} 天），需注意推进速度。",
                recommendation="倒排里程碑计划，按周跟踪关键节点完成率，避免收尾被动。",
            ))

    if config.enabled_rules.cost and project.budget is not None and project.cost is not None:
        ratio = float(project.cost / project.budget) if project.budget > 0 else 0
        if ratio > thresholds.cost_block:
            risks.append(RiskItem(
                type="cost-overrun", level="block",
                reason=f"成本严重超支：已支出 {_number(project.cost)} 万元，超出预算 {_number(project.budget)} 万元，成本使用率 {ratio * 100:.1f}%。",
                recommendation="暂停新增需求范围，财务与项目经理联合出具成本说明，必要时启动合同变更。",
            ))
        elif ratio > thresholds.cost_warn:
            risks.append(RiskItem(
                type="cost-overrun", level="warn",
                reason=f"成本接近预算上限：已支出 {_number(project.cost)} 万元，预算 {_number(project.budget)} 万元，成本使用率 {ratio * 100:.1f}%。",
                recommendation="复核剩余工作所需支出，对超预算风险提前向客户和管理层同步。",
            ))

    if config.enabled_rules.document_missing:
        for item in deliverables:
            if item.required and item.status == "missing":
                risks.append(RiskItem(
                    type="document-missing", level="block",
                    reason=f"必须交付物缺失：{item.name}（分类：{item.category}）尚未归档，影响项目验收与合规。",
                    recommendation=f"立即指派责任人补齐 {item.name}，并冻结其首个有效版本。",
                ))

    if config.enabled_rules.version_conflict:
        for item in deliverables:
            if item.unfrozen_versions >= 2:
                risks.append(RiskItem(
                    type="version-conflict", level="warn",
                    reason=f"交付物 {item.name}（分类：{item.category}）存在至少 2 个未冻结版本，可能导致版本冲突或误用。",
                    recommendation=f"确认 {item.name} 的最终版本并冻结，清理历史无效版本。",
                ))

    if config.enabled_rules.rule_conflict and project.stage == "accepting":
        if not any(item.category == "验收材料" for item in deliverables):
            risks.append(RiskItem(
                type="rule-conflict", level="block",
                reason="项目当前阶段为“验收前”，但文件空间中未找到“验收材料”类交付物，不满足验收条件。",
                recommendation="补齐验收材料清单，确认验收模板版本，并通过审核人复核后再推进验收。",
            ))
    return risks


def aggregate_risk(risks: list[RiskItem]) -> str:
    if any(item.level == "block" for item in risks):
        return "block"
    if any(item.level == "warn" for item in risks):
        return "warn"
    return "ok"
