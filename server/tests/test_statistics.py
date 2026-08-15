from decimal import Decimal
from types import SimpleNamespace

from app.services.statistics import group_by_stage, project_averages


def project(**overrides):
    values = {
        "stage": "executing",
        "budget": Decimal("100"),
        "cost": Decimal("75"),
        "planned_days": 200,
        "used_days": 100,
        "satisfaction": Decimal("4.50"),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_project_averages_only_include_complete_valid_samples():
    cost, schedule, satisfaction = project_averages(
        [
            project(),
            project(budget=None, planned_days=0, satisfaction=None),
            project(cost=None, used_days=None, satisfaction=Decimal("3.50")),
        ]
    )

    assert cost.value == 75.0 and cost.sample_count == 1
    assert schedule.value == 50.0 and schedule.sample_count == 1
    assert satisfaction.value == 4.0 and satisfaction.sample_count == 2


def test_empty_averages_are_null():
    cost, schedule, satisfaction = project_averages([])
    assert cost.value is None and cost.sample_count == 0
    assert schedule.value is None and schedule.sample_count == 0
    assert satisfaction.value is None and satisfaction.sample_count == 0


def test_stage_groups_include_null_bucket_and_independent_samples():
    groups = group_by_stage(
        [
            project(stage="planning"),
            project(stage=None, budget=None, cost=None),
        ]
    )

    assert [group.stage for group in groups] == ["planning", None]
    assert groups[1].count == 1
    assert groups[1].average_cost_usage_rate.value is None
    assert groups[1].average_cost_usage_rate.sample_count == 0
    assert groups[1].average_schedule_usage_rate.sample_count == 1
