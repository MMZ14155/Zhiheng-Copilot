from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.services.risk_monitor import (
    DeliverableRiskState,
    evaluate_project,
    get_default_risk_config,
)


def project(**overrides):
    values = dict(
        id=1, stage="executing", status="项目启动", planned_delivery_date=None,
        planned_days=None, used_days=None, budget=None, cost=None,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def deliverable(**overrides):
    values = dict(
        name="report", category="合同", required=True,
        status="ok", unfrozen_versions=0,
        extensions=(), document_types=(),
        payment_status=None,
    )
    values.update(overrides)
    return DeliverableRiskState(**values)


def payment_item(name, payment_status):
    return deliverable(name=name, category="回款", payment_status=payment_status)


@pytest.mark.parametrize(
    ("remaining", "triggered"), [(-1, True), (0, True), (30, True), (31, False)],
)
def test_delivery_warning_boundaries(remaining, triggered):
    today = date(2026, 1, 1)
    risks = evaluate_project(
        project(planned_delivery_date=today + timedelta(days=remaining)), [],
        get_default_risk_config(1), today=today,
    )
    risk = next((item for item in risks if item.type == "delivery-warning"), None)
    assert (risk is not None) is triggered
    if risk:
        assert risk.remaining_days == remaining


@pytest.mark.parametrize("status", ["项目结项"])
def test_delivery_warning_excludes_closed_projects(status):
    risks = evaluate_project(
        project(status=status, planned_delivery_date=date(2025, 1, 1)), [],
        get_default_risk_config(1), today=date(2026, 1, 1),
    )
    assert not any(item.type == "delivery-warning" for item in risks)


@pytest.mark.parametrize(
    ("items", "expected_type"),
    [
        ([payment_item("全款", "已付款")], None),
        ([payment_item("首款", "已付款"), payment_item("尾款", "已付款")], None),
        ([payment_item("首款", "已付款")], "payment-uncleared"),
        ([payment_item("尾款", "已付款")], "payment-uncleared"),
        ([], "payment-uncleared"),
    ],
)
def test_payment_uncleared_status(items, expected_type):
    risks = evaluate_project(project(), items, get_default_risk_config(1))
    risk = next((item for item in risks if item.type == "payment-uncleared"), None)
    assert (risk is not None) is (expected_type is not None)


def test_payment_uncleared_rule_switch():
    config = get_default_risk_config(1)
    config.enabled_rules.payment_uncleared = False
    assert not any(
        item.type == "payment-uncleared"
        for item in evaluate_project(
            project(), [payment_item("首款", "已付款")], config,
        )
    )
