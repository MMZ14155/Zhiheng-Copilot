import asyncio
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.api import projects
from app.models.project import Project
from app.models.project_link import ProjectLink
from app.models.tracked_file import TrackedFile
from app.schemas.projects import ProjectCreate, ProjectLinkCreate, ProjectPartyWrite, ProjectUpdate, ProjectNotesUpdate
from tests.conftest import Result, ScalarRows


def project(now, ident=1):
    return Project(id=ident, name=f"项目{ident}", code=f"P{ident}", customer_name="客户",
        project_type=None,
        parties=[], contract_amount=None, signed_date=None, started_date=None,
        planned_delivery_date=None, status="项目启动", progress=20, stage="executing",
        budget=None, cost=None, planned_days=None, used_days=None, quality_issues=None,
        satisfaction=None, acceptance_result=None, risk_config=None, notes=None,
        created_at=now, updated_at=now)


def test_helpers_and_date_validation(fake_session):
    assert projects._canonical_pair(9, 2) == (2, 9)
    with pytest.raises(HTTPException): projects._canonical_pair(2, 2)
    party = SimpleNamespace(role="甲方", name="客户", contact=None, contact_person=None, contact_info=None)
    assert projects._serialize_parties([party])[0]["role"] == "甲方"
    projects._validate_dates(date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 3))
    with pytest.raises(HTTPException): projects._validate_dates(date(2026, 2, 1), date(2026, 1, 1), None)
    with pytest.raises(HTTPException): projects._validate_dates(None, date(2026, 2, 1), date(2026, 1, 1))
    fake_session.get.return_value = None
    with pytest.raises(HTTPException): asyncio.run(projects._get_project_or_404(fake_session, 7))


def test_list_projects_admin_and_member(fake_session, users, now):
    p = project(now)
    fake_session.scalar.return_value = 1
    fake_session.execute.return_value = Result([p])
    response = asyncio.run(projects.list_projects(1, 20, "客户", "项目启动", "客", None, "软件销售", fake_session, users.member))
    assert response.total == 1 and response.items[0].code == "P1"
    executed_sqls = [str(call.args[0]) for call in fake_session.execute.call_args_list]
    assert any("project.project_type" in sql for sql in executed_sqls) and any("project_member.user_id" in sql for sql in executed_sqls)
    response = asyncio.run(projects.list_projects(2, 5, None, None, None, None, None, fake_session, users.admin))
    assert response.page == 2


def test_create_update_project(fake_session, users, now, monkeypatch):
    payload = ProjectCreate(name="新项目", project_type="正版化服务", customer_name="客户",
        parties=[ProjectPartyWrite(role="甲方", name="客户")], signed_date=date(2026, 1, 1),
        started_date=date(2026, 1, 2), planned_delivery_date=date(2026, 2, 1))
    async def refresh(obj):
        obj.id = 3; obj.created_at = obj.updated_at = now
        obj.stage = obj.budget = obj.cost = obj.planned_days = obj.used_days = None
        obj.quality_issues = obj.satisfaction = obj.acceptance_result = None
    fake_session.refresh.side_effect = refresh
    created = asyncio.run(projects.create_project(payload, fake_session, users.admin))
    assert created.code.startswith("PRJ-") and created.project_type == "正版化服务"

    existing = project(now, 3)
    fake_session.get.return_value = existing
    monkeypatch.setattr(projects, "require_project_role", AsyncMock())
    updated = asyncio.run(projects.update_project(3, ProjectUpdate(name="已更新", parties=[]), fake_session, users.member))
    assert updated.name == "已更新" and updated.parties == []


def test_create_project_with_renewal_in_one_transaction(fake_session, users, now):
    source = project(now, 5)
    fake_session.get.return_value = source
    payload = ProjectCreate(name="续签项目", customer_name="客户", renewal_source_id=5)
    # 模拟数据库在 flush 时分配自增主键。
    async def flush():
        for item in fake_session.added:
            if isinstance(item, Project) and item.id is None:
                item.id = 9
    fake_session.flush.side_effect = flush
    async def refresh(obj):
        obj.id = 9; obj.created_at = obj.updated_at = now
        obj.stage = obj.budget = obj.cost = obj.planned_days = obj.used_days = None
        obj.quality_issues = obj.satisfaction = obj.acceptance_result = None
    fake_session.refresh.side_effect = refresh
    created = asyncio.run(projects.create_project(payload, fake_session, users.admin))
    assert created.id == 9
    link = next((item for item in fake_session.added if isinstance(item, ProjectLink)), None)
    assert link is not None and link.link_type == "renewal"
    assert {link.source_project_id, link.target_project_id} == {5, 9}

    # 续签来源不存在时创建整体失败，不产生孤儿项目。
    fake_session.added.clear()
    fake_session.get.return_value = None
    with pytest.raises(HTTPException) as exc:
        asyncio.run(projects.create_project(payload, fake_session, users.admin))
    assert exc.value.status_code == 404
    assert not fake_session.added


def test_project_type_validation():
    payload = ProjectCreate(name="项目", code="P", customer_name="客户", project_type="软件销售")
    assert payload.project_type == "软件销售"
    with pytest.raises(ValidationError):
        ProjectCreate(name="项目", code="P", customer_name="客户", project_type="其他")


def test_generated_project_code_retries_conflict(fake_session, users, now, monkeypatch):
    payload = ProjectCreate(name="新项目", customer_name="客户")
    monkeypatch.setattr(projects.secrets, "token_hex", lambda size: "abcd1234")
    fake_session.flush.side_effect = [IntegrityError("insert", {}, Exception("duplicate")), None]

    async def refresh(obj):
        obj.id = 3
        obj.created_at = obj.updated_at = now
        obj.stage = obj.budget = obj.cost = obj.planned_days = obj.used_days = None
        obj.quality_issues = obj.satisfaction = obj.acceptance_result = None

    fake_session.refresh.side_effect = refresh
    created = asyncio.run(projects.create_project(payload, fake_session, users.admin))
    assert created.code == "PRJ-ABCD1234"


def test_create_project_generates_payment_deliverables(fake_session, users, now):
    async def flush():
        for item in fake_session.added:
            if isinstance(item, Project) and item.id is None:
                item.id = 7
    fake_session.flush.side_effect = flush

    async def refresh(obj):
        obj.id = 7
        obj.created_at = obj.updated_at = now
        obj.stage = obj.budget = obj.cost = obj.planned_days = obj.used_days = None
        obj.quality_issues = obj.satisfaction = obj.acceptance_result = None

    fake_session.refresh.side_effect = refresh
    payload = ProjectCreate(
        name="回款项目",
        customer_name="客户",
        contract_amount=Decimal("10000"),
        payment_terms=[
            {"stage": "首款30%", "ratio": "30%"},
            {"stage": "验收后支付尾款70%", "ratio": "70%"},
        ],
    )
    created = asyncio.run(projects.create_project(payload, fake_session, users.admin))
    assert created.id == 7
    tracked = [item for item in fake_session.added if isinstance(item, TrackedFile)]
    assert len(tracked) == 2
    assert {t.name for t in tracked} == {"首款", "尾款"}
    assert all(t.payment_status == "未付款" for t in tracked)
    assert all(t.category == "回款" for t in tracked)
    first = next(t for t in tracked if t.name == "首款")
    assert first.receivable_amount == Decimal("3000.00")
    tail = next(t for t in tracked if t.name == "尾款")
    assert tail.receivable_amount == Decimal("7000.00")


def test_project_detail_and_risks(fake_session, users, now, monkeypatch):
    p = project(now)
    fake_session.get.return_value = p
    fake_session.execute.side_effect = [Result([]), Result([])]
    fake_session.scalars.return_value = ScalarRows([])
    monkeypatch.setattr(projects, "require_project_role", AsyncMock())
    detail = asyncio.run(projects.get_project(1, fake_session, users.member))
    assert detail.id == 1 and detail.latest_summary is None
    assert detail.manager_ids == []

    monkeypatch.setattr(projects.DeliverableService, "list_with_state", AsyncMock(return_value=[]))
    monkeypatch.setattr(projects, "load_financial_documents", AsyncMock(return_value={}))
    risk = asyncio.run(projects.get_project_risks(1, fake_session, users.member))
    assert risk.level in {"ok", "warn", "block"}
    config = asyncio.run(projects.get_project_risk_config(1, fake_session, users.member))
    assert config.project_id == "1"
    changed = config.model_copy(update={"progress_warn_threshold": 70})
    result = asyncio.run(projects.update_project_risk_config(1, changed, fake_session, users.member))
    assert result.progress_warn_threshold == 70 and p.risk_config


def test_list_project_risks_batch(fake_session, users, now, monkeypatch):
    p = project(now)
    # 每次调用依次查询项目列表与交付物（list_states_by_projects 内部）。
    fake_session.execute.side_effect = [
        Result([p]), Result([]),
        Result([p]), Result([]),
    ]
    monkeypatch.setattr(projects, "load_financial_documents", AsyncMock(return_value={}))
    response = asyncio.run(projects.list_project_risks(fake_session, users.admin))
    assert response.items[0].project_id == 1
    assert response.items[0].level in {"ok", "warn", "block"}

    asyncio.run(projects.list_project_risks(fake_session, users.member))
    sql_texts = [str(call.args[0]) for call in fake_session.execute.call_args_list]
    assert any("project_member.user_id" in sql for sql in sql_texts)


def test_update_project_notes(fake_session, users, now, monkeypatch):
    p = project(now)
    fake_session.get.return_value = p
    monkeypatch.setattr(projects, "require_project_role", AsyncMock())
    updated = asyncio.run(
        projects.update_project_notes(
            1, ProjectNotesUpdate(notes="新的备注"), fake_session, users.member
        )
    )
    assert updated.notes == "新的备注"
    fake_session.commit.assert_awaited_once()


def test_get_project_detail_includes_manager_ids(fake_session, users, now, monkeypatch):
    p = project(now)
    fake_session.get.return_value = p
    fake_session.execute.side_effect = [Result([]), Result([])]
    fake_session.scalars.return_value = ScalarRows([users.admin.id])
    monkeypatch.setattr(projects, "require_project_role", AsyncMock())
    detail = asyncio.run(projects.get_project(1, fake_session, users.member))
    assert detail.manager_ids == [users.admin.id]


def test_links_and_renewal(fake_session, users, now, monkeypatch):
    monkeypatch.setattr(projects, "require_project_role", AsyncMock())
    fake_session.scalar.side_effect = [2, None]
    async def refresh(obj): obj.id = 4; obj.created_at = now
    fake_session.refresh.side_effect = refresh
    response = asyncio.run(projects.create_project_link(2, ProjectLinkCreate(target_project_id=1, link_type="renewal"), fake_session, users.member))
    assert response.source_project_id == 1 and response.target_project_id == 2

    link = ProjectLink(id=4, source_project_id=1, target_project_id=2, link_type="renewal", note=None, created_at=now)
    fake_session.get.return_value = link
    assert asyncio.run(projects.delete_project_link(4, fake_session, users.member)) is None
    fake_session.get.return_value = None
    with pytest.raises(HTTPException): asyncio.run(projects.delete_project_link(9, fake_session, users.member))

    p = project(now)
    fake_session.get.return_value = p
    row = SimpleNamespace(_mapping={column.name: getattr(p, column.name) for column in Project.__table__.columns})
    fake_session.execute.return_value = Result([row])
    chain = asyncio.run(projects.get_renewal_chain(1, fake_session, users.member))
    assert chain.depth_limit == 20 and chain.items[0].id == 1


def test_link_conflicts(fake_session, users, monkeypatch):
    monkeypatch.setattr(projects, "require_project_role", AsyncMock())
    fake_session.scalar.return_value = 1
    with pytest.raises(HTTPException) as exc:
        asyncio.run(projects.create_project_link(1, ProjectLinkCreate(target_project_id=2, link_type="related"), fake_session, users.admin))
    assert exc.value.detail["code"] == "PROJECT_NOT_FOUND"

    fake_session.scalar.side_effect = [2, ProjectLink(id=1)]
    with pytest.raises(HTTPException) as exc:
        asyncio.run(projects.create_project_link(1, ProjectLinkCreate(target_project_id=2, link_type="related"), fake_session, users.admin))
    assert exc.value.detail["code"] == "PROJECT_LINK_EXISTS"
