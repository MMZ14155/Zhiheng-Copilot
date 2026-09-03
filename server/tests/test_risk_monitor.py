from datetime import date, timedelta
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
        "id": 1, "stage": "executing", "status": "项目启动",
        "planned_delivery_date": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def deliverable(**overrides):
    values = {
        "name": "report.docx", "category": "合同", "required": True,
        "status": "ok", "unfrozen_versions": 0,
        "extensions": (".docx",), "document_types": ("contract",),
        "payment_status": None,
    }
    values.update(overrides)
    return DeliverableRiskState(**values)


def payment_item(name, status):
    return deliverable(name=name, category="回款", payment_status=status)


def risks_for(value, deliverables=None, config=None):
    return evaluate_project(
        value, deliverables or [], config or get_default_risk_config(value.id)
    )


def find(risks, risk_type):
    return next((risk for risk in risks if risk.type == risk_type), None)


def test_default_config_matches_reference():
    config = get_default_risk_config("P_001")
    assert config.project_id == "P_001"
    assert config.enabled_rules.model_dump() == {
        "material_missing": True,
        "delivery_warning": True,
        "payment_uncleared": True,
    }
    assert config.thresholds.model_dump() == {"delivery_warn_days": 30}


@pytest.mark.parametrize(
    ("delivery_date", "remaining", "triggered"),
    [
        (date.today() + timedelta(days=30), 30, True),
        (date.today() + timedelta(days=31), 31, False),
        (date.today() - timedelta(days=5), -5, True),
    ],
)
def test_delivery_warning_boundary(delivery_date, remaining, triggered):
    risk = find(
        risks_for(project(planned_delivery_date=delivery_date)),
        "delivery-warning",
    )
    assert (risk is not None) is triggered
    if risk:
        assert risk.remaining_days == remaining


def test_delivery_warning_ignores_closed_projects():
    assert find(
        risks_for(
            project(
                planned_delivery_date=date.today() + timedelta(days=10),
                status="项目结项",
            ),
        ),
        "delivery-warning",
    ) is None


def test_delivery_warning_dismissed_flag():
    p = project(
        planned_delivery_date=date.today() + timedelta(days=10),
        delivery_warning_dismissed=True,
    )
    risk = find(risks_for(p), "delivery-warning")
    assert risk is not None
    assert risk.dismissed is True


def test_material_missing_detects_doc_pdf_invoice():
    items = [
        deliverable(name="contract.pdf", extensions=(".pdf",), document_types=("contract",)),
        deliverable(name="invoice.docx", extensions=(), document_types=("invoice",)),
    ]
    risks = [risk for risk in risks_for(project(), items) if risk.type == "material-missing"]
    assert len(risks) == 1
    assert risks[0].missing_parts == ["doc合同"]


def test_material_missing_all_clear():
    items = [
        deliverable(name="contract.docx", extensions=(".docx",), document_types=("contract",)),
        deliverable(name="contract.pdf", extensions=(".pdf",), document_types=("contract",)),
        deliverable(name="invoice.pdf", extensions=(".pdf",), document_types=("invoice",)),
    ]
    assert find(risks_for(project(), items), "material-missing") is None


def test_material_missing_invoice_by_name():
    items = [
        deliverable(name="contract.docx", extensions=(".docx",)),
        deliverable(name="contract.pdf", extensions=(".pdf",)),
        deliverable(name="发票.pdf", extensions=(".pdf",)),
    ]
    assert find(risks_for(project(), items), "material-missing") is None


@pytest.mark.parametrize(
    ("items", "expected"),
    [
        ([("全款", "已付款")], "已付全款"),
        ([("首款", "已付款"), ("尾款", "已付款")], "已付全款"),
        ([("首款", "已付款")], "已付首款"),
        ([("尾款", "已付款")], "未付款"),
        ([], "未付款"),
    ],
)
def test_payment_uncleared_status(items, expected):
    deliverables = [payment_item(name, status) for name, status in items]
    risk = find(risks_for(project(), deliverables), "payment-uncleared")
    if expected == "已付全款":
        assert risk is None
    else:
        assert risk is not None
        assert risk.payment_status == expected


def test_payment_uncleared_rule_switch():
    config = get_default_risk_config(1)
    config.enabled_rules.payment_uncleared = False
    assert find(risks_for(project(), [payment_item("首款", "已付款")], config=config), "payment-uncleared") is None


def test_material_missing_rule_switch():
    config = get_default_risk_config(1)
    config.enabled_rules.material_missing = False
    assert find(risks_for(project(), [deliverable(extensions=())], config=config), "material-missing") is None


def test_delivery_warning_rule_switch():
    config = get_default_risk_config(1)
    config.enabled_rules.delivery_warning = False
    assert find(
        risks_for(
            project(planned_delivery_date=date.today() + timedelta(days=5)),
            config=config,
        ),
        "delivery-warning",
    ) is None


def test_aggregate_risk():
    assert aggregate_risk([]) == "ok"
    warn = find(
        risks_for(project(planned_delivery_date=date.today() + timedelta(days=5))),
        "delivery-warning",
    )
    assert aggregate_risk([warn]) == "warn"
