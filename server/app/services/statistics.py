from collections import Counter, defaultdict
from collections.abc import Iterable
from decimal import Decimal

from app.models.project import Project
from app.schemas.statistics import AverageMetric, StageStatistics


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
