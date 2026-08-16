import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from app.api import projects
from app.models.project import Project
from app.services.collections import CollectionDocument, aggregate_collection_overview

NOW = datetime(2026, 8, 1, tzinfo=timezone.utc)
def doc(version, kind, amount, **kwargs):
    return CollectionDocument(version, kind, Decimal(amount), NOW, **kwargs)

def test_aggregation_precision_latest_and_deduplication():
    old = CollectionDocument("old", "contract", Decimal("80"), NOW - timedelta(days=1),
        payment_terms=({"ratio": "100%", "planned_date": "2025-01-01"},))
    result = aggregate_collection_overview([old,
        doc("c", "contract", "1234567890123456.78", payment_terms=(
            {"ratio": "30%", "planned_date": "2026-01-01"}, {"ratio": "70%", "planned_date": "2027-01-01"})),
        doc("p", "payment", "100000000000000.01", contract_no="C"),
        doc("p", "payment", "100000000000000.01", contract_no="C"), doc("i", "invoice", "120.12")], date(2026, 8, 16))
    assert result.contract_amount == Decimal("1234567890123456.78")
    assert result.receivable_amount == Decimal("370370367037037.034")
    assert result.received_amount == Decimal("100000000000000.01")
    assert result.overdue_amount == Decimal("270370367037037.024")
    assert result.collection_rate == Decimal("0.0810") and result.data_status == "ok"

@pytest.mark.parametrize(("items", "reason"), [([], "缺少已解析合同"),
    ([doc("c", "contract", "100")], "合同缺少付款条款"),
    ([doc("c", "contract", "100", payment_terms=({"ratio": "1"},))], "付款条款缺少计划日期"),
    ([doc("c", "contract", "100", payment_terms=({"ratio": "1", "planned_date": "2026-01-01"},)), doc("p", "payment", "20")], "付款单缺少合同号")])
def test_incomplete_branches(items, reason):
    result = aggregate_collection_overview(items, date(2026, 8, 16))
    assert result.data_status == "incomplete" and reason in result.incomplete_reasons

def test_partial_payment_and_endpoint(fake_session, users, monkeypatch):
    items = [doc("c", "contract", "100", payment_terms=({"ratio": "50%", "planned_date": "2026-01-01"},)),
        doc("p", "payment", "20", contract_no="C")]
    result = aggregate_collection_overview(items, date(2026, 8, 16))
    assert result.overdue_amount == Decimal("30.00")
    fake_session.get.return_value = Project(id=1)
    monkeypatch.setattr(projects, "require_project_role", AsyncMock())
    monkeypatch.setattr(projects, "load_collection_documents", AsyncMock(return_value=items))
    response = asyncio.run(projects.get_collection_overview(1, fake_session, users.member))
    assert response.model_dump(mode="json")["collection_rate"] == "0.2000"
    projects.require_project_role.side_effect = HTTPException(403, "forbidden")
    with pytest.raises(HTTPException): asyncio.run(projects.get_collection_overview(1, fake_session, users.member))

def test_missing_project(fake_session, users, monkeypatch):
    fake_session.get.return_value = None
    monkeypatch.setattr(projects, "require_project_role", AsyncMock())
    with pytest.raises(HTTPException) as exc:
        asyncio.run(projects.get_collection_overview(404, fake_session, users.admin))
    assert exc.value.status_code == 404
