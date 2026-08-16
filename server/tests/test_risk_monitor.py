from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services.risk_monitor import (
    DeliverableRiskState,
    aggregate_risk,
    evaluate_project,
    get_default_risk_config,
)


def project(**overrides):
    values = {
        "id": 1, "stage": "executing", "budget": Decimal("100"),
        "cost": Decimal("80"), "planned_days": 200, "used_days": 5,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def deliverable(**overrides):
    values = {
        "name": "report.docx", "category": "交付成果", "required": True,
        "status": "ok", "unfrozen_versions": 0,
    }
    values.update(overrides)
    return DeliverableRiskState(**values)


def risks_for(value, deliverables=None, config=None):
    return evaluate_project(
        value, deliverables or [], config or get_default_risk_config(value.id)
    )


def find(risks, risk_type):
    return next((risk for risk in risks if risk.type == risk_type), None)


def test_default_config_matches_reference():
    config = get_default_risk_config("P_001")
    assert config.project_id == "P_001"
    assert all(config.enabled_rules.model_dump().values())
    assert config.thresholds.model_dump() == {
        "cost_warn": 0.9, "cost_block": 1.0,
        "schedule_warn": 0.95, "schedule_block": 1.0,
        "quality_warn": 2, "quality_block": 3,
        "sat_warn": 3.5, "sat_block": 3.0,
        "delivery_warn_days": 30, "delivery_block_days": 0, "payment_warn_days": 0,
        "payment_block_days": 30,
    }


@pytest.mark.parametrize(
    ("used", "planned", "expected"),
    [(110, 100, "block"), (96, 100, "warn"), (100, 100, "warn"), (95, 100, None), (0, 0, None)],
)
def test_schedule_threshold_boundaries(used, planned, expected):
    risk = find(risks_for(project(used_days=used, planned_days=planned)), "schedule-overrun")
    assert (risk.level if risk else None) == expected


def test_schedule_is_mandatory_even_when_disabled():
    config = get_default_risk_config(1)
    config.enabled_rules.schedule = False
    assert find(risks_for(project(used_days=110, planned_days=100), config=config), "schedule-overrun")


@pytest.mark.parametrize(("remaining", "triggered"), [(89, True), (90, False), (91, False), (-10, True)])
def test_remaining_days_boundary(remaining, triggered):
    risk = find(risks_for(project(planned_days=100, used_days=100 - remaining)), "schedule-remaining")
    assert (risk is not None) is triggered
    if risk:
        assert str(remaining) in risk.reason


@pytest.mark.parametrize(
    ("cost", "budget", "expected"),
    [(110, 100, "block"), (91, 100, "warn"), (100, 100, "warn"), (90, 100, None), (10, 0, None)],
)
def test_cost_threshold_boundaries(cost, budget, expected):
    risk = find(risks_for(project(cost=Decimal(cost), budget=Decimal(budget))), "cost-overrun")
    assert (risk.level if risk else None) == expected


def test_custom_cost_threshold_and_rule_switch():
    config = get_default_risk_config(1)
    config.thresholds.cost_warn = 0.5
    config.thresholds.cost_block = 0.7
    assert find(risks_for(project(), config=config), "cost-overrun").level == "block"
    config.enabled_rules.cost = False
    assert find(risks_for(project(cost=Decimal("110")), config=config), "cost-overrun") is None


def test_document_missing_matches_required_and_realtime_status():
    items = [
        deliverable(name="合同文件", category="合同", status="missing"),
        deliverable(name="optional", required=False, status="missing"),
    ]
    missing = [risk for risk in risks_for(project(), items) if risk.type == "document-missing"]
    assert len(missing) == 1
    assert "合同文件" in missing[0].reason and "合同" in missing[0].reason


@pytest.mark.parametrize(("unfrozen", "triggered"), [(0, False), (1, False), (2, True), (3, True)])
def test_version_conflict_unfrozen_boundary(unfrozen, triggered):
    risk = find(risks_for(project(), [deliverable(unfrozen_versions=unfrozen)]), "version-conflict")
    assert (risk is not None) is triggered


def test_accepting_without_acceptance_material_blocks():
    risks = risks_for(project(stage="accepting"), [deliverable(category="合同")])
    assert find(risks, "rule-conflict").level == "block"
    assert find(risks_for(project(stage="accepting"), [deliverable(category="验收材料")]), "rule-conflict") is None


def test_nullable_business_fields_skip_corresponding_rules():
    value = project(budget=None, cost=None, planned_days=None, used_days=None)
    assert risks_for(value) == []


def test_aggregate_uses_highest_severity():
    warn = find(risks_for(project(planned_days=100, used_days=11)), "schedule-remaining")
    block = find(risks_for(project(cost=Decimal("110"))), "cost-overrun")
    assert aggregate_risk([]) == "ok"
    assert aggregate_risk([warn]) == "warn"
    assert aggregate_risk([warn, block]) == "block"


@pytest.mark.parametrize(
    ("kind", "left", "right", "expected"),
    [
        ("schedule", 101, 100, "block"), ("schedule", 100, 100, "warn"),
        ("schedule", 99, 100, "warn"), ("schedule", 96, 100, "warn"),
        ("schedule", 95, 100, None), ("schedule", 94, 100, None),
        ("schedule", 1, 0, None), ("schedule", 0, 0, None),
        ("cost", 101, 100, "block"), ("cost", 100, 100, "warn"),
        ("cost", 99, 100, "warn"), ("cost", 91, 100, "warn"),
        ("cost", 90, 100, None), ("cost", 89, 100, None),
        ("cost", 1, 0, None), ("cost", 0, 0, None),
        ("remaining", 0, 89, "warn"), ("remaining", 1, 89, "warn"),
        ("remaining", 10, 100, None), ("remaining", 11, 90, "warn"),
        ("remaining", 0, 90, None), ("remaining", 0, 91, None),
        ("remaining", 110, 100, "warn"),
        ("document", 1, 1, "block"), ("document", 1, 0, None),
        ("document", 0, 1, None), ("document", 0, 0, None),
        ("document", 2, 1, "block"),
        ("version", 0, 0, None), ("version", 1, 0, None),
        ("version", 2, 0, "warn"), ("version", 3, 0, "warn"),
        ("version", 10, 0, "warn"),
    ],
)
def test_reference_parity_matrix(kind, left, right, expected):
    if kind == "schedule":
        risk = find(risks_for(project(used_days=left, planned_days=right)), "schedule-overrun")
    elif kind == "cost":
        risk = find(
            risks_for(project(cost=Decimal(left), budget=Decimal(right))),
            "cost-overrun",
        )
    elif kind == "remaining":
        risk = find(risks_for(project(used_days=left, planned_days=right)), "schedule-remaining")
    elif kind == "document":
        risk = find(
            risks_for(project(), [deliverable(required=bool(left), status="missing" if right else "ok")]),
            "document-missing",
        )
    else:
        risk = find(risks_for(project(), [deliverable(unfrozen_versions=left)]), "version-conflict")
    assert (risk.level if risk else None) == expected
