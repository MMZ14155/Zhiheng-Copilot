from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class AverageMetric(BaseModel):
    value: float | None
    sample_count: int


class RiskCounts(BaseModel):
    block: int
    warn: int
    ok: int


class ProjectStatistics(BaseModel):
    total: int
    risks: RiskCounts
    average_cost_usage_rate: AverageMetric
    average_schedule_usage_rate: AverageMetric
    average_satisfaction: AverageMetric


class DeliverableStatusCounts(BaseModel):
    missing: int
    old: int
    conflict: int
    ok: int


class FileStatistics(BaseModel):
    workspace_file_total: int
    deliverables: DeliverableStatusCounts


class StageStatistics(BaseModel):
    stage: Literal["init", "planning", "executing", "accepting", "closed"] | None
    count: int
    average_cost_usage_rate: AverageMetric
    average_schedule_usage_rate: AverageMetric
    average_satisfaction: AverageMetric


class PaymentStatistics(BaseModel):
    contract_amount: Decimal = Decimal("0")
    invoiced_amount: Decimal = Decimal("0")
    receivable_amount: Decimal = Decimal("0")
    received_amount: Decimal = Decimal("0")
    outstanding_amount: Decimal = Decimal("0")
    overdue_amount: Decimal = Decimal("0")
    collection_rate: Decimal | None = None
    data_incomplete_projects: int = 0


class StatisticsOverviewResponse(BaseModel):
    projects: ProjectStatistics
    files: FileStatistics
    by_stage: list[StageStatistics]
    project_type_distribution: dict[str, int] = Field(default_factory=dict)
    delivery_deadline_distribution: dict[str, int] = Field(default_factory=dict)
    payment: PaymentStatistics = Field(default_factory=PaymentStatistics)
