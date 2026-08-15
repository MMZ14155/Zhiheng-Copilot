from typing import Literal

from pydantic import BaseModel


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


class StatisticsOverviewResponse(BaseModel):
    projects: ProjectStatistics
    files: FileStatistics
    by_stage: list[StageStatistics]
