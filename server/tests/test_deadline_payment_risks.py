from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services.risk_monitor import (
    PaymentRiskState, evaluate_project, get_default_risk_config,
)
from app.services.statistics import FinancialDocument, aggregate_project_finance


def project(**overrides):
    values = dict(
        id=1, stage="executing", status="项目启动", planned_delivery_date=None,
        planned_days=None, used_days=None, budget=None, cost=None,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def document(kind, version, **overrides):
    values = dict(
        project_id=1, file_id=1, version=version, kind=kind,
        amount=Decimal("1000"), created_at="2026-01-01", contract_no="C-1",
    )
    values.update(overrides)
    return FinancialDocument(**values)


@pytest.mark.parametrize(
    ("remaining", "level"), [(-1, "block"), (0, "warn"), (30, "warn"), (31, None)],
)
def test_delivery_deadline_boundaries(remaining, level):
    today = date(2026, 1, 1)
    risks = evaluate_project(
        project(planned_delivery_date=today + timedelta(days=remaining)), [],
        get_default_risk_config(1), today=today,
    )
    risk = next((item for item in risks if item.type == "delivery-deadline"), None)
    assert (risk.level if risk else None) == level
    if risk:
        assert risk.remaining_days == remaining


@pytest.mark.parametrize("status", ["项目结项"])
def test_delivery_deadline_excludes_closed_projects(status):
    risks = evaluate_project(
        project(status=status, planned_delivery_date=date(2025, 1, 1)), [],
        get_default_risk_config(1), today=date(2026, 1, 1),
    )
    assert not any(item.type == "delivery-deadline" for item in risks)


def test_finance_partial_payment_and_duplicate_version():
    docs = [
        document("contract", "c1", signed_date=date(2026, 1, 1),
                 payment_terms=({"stage": "签订", "ratio": "100%"},)),
        document("invoice", "i1", amount=Decimal("800")),
        document("payment", "p1", amount=Decimal("400"), payment_date=date(2026, 1, 2)),
        document("payment", "p1", amount=Decimal("400"), payment_date=date(2026, 1, 2)),
    ]
    state = aggregate_project_finance(docs, date(2026, 2, 1))
    assert state.contract_amount == Decimal("1000")
    assert state.invoiced_amount == Decimal("800")
    assert state.received_amount == Decimal("400")
    assert state.overdue_amount == Decimal("600")
    assert state.data_incomplete and "存在重复版本单据" in state.incomplete_reasons


def test_finance_missing_contract_number_is_incomplete_not_overdue_risk():
    docs = [
        document("contract", "c1", signed_date=date(2026, 1, 1),
                 payment_terms=({"stage": "签订", "ratio": "50%"},)),
        document("payment", "p1", amount=Decimal("100"), contract_no=None),
    ]
    state = aggregate_project_finance(docs, date(2026, 2, 1))
    risks = evaluate_project(project(), [], get_default_risk_config(1), state, date(2026, 2, 1))
    assert state.received_amount == Decimal("100")
    assert any(item.type == "payment-data-incomplete" for item in risks)
    assert not any(item.type == "payment-overdue" for item in risks)


def test_payment_overdue_threshold_is_configurable():
    state = PaymentRiskState(
        contract_amount=Decimal("1000"), receivable_amount=Decimal("500"),
        received_amount=Decimal("100"), overdue_amount=Decimal("400"), overdue_days=30,
    )
    config = get_default_risk_config(1)
    risks = evaluate_project(project(), [], config, state, date(2026, 2, 1))
    risk = next(item for item in risks if item.type == "payment-overdue")
    assert risk.level == "block"
    assert risk.overdue_amount == Decimal("400") and risk.overdue_days == 30
    config.enabled_rules.payment_collection = False
    assert not any(item.type.startswith("payment-") for item in evaluate_project(
        project(), [], config, state, date(2026, 2, 1),
    ))
