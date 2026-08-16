import asyncio
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api import projects
from app.models.project import Project
from app.models.project_link import ProjectLink
from app.schemas.projects import ProjectCreate, ProjectLinkCreate, ProjectParty, ProjectUpdate
from app.schemas.risks import RiskConfig
from tests.conftest import Result


def project(now, ident=1):
    return Project(id=ident, name=f"项目{ident}", code=f"P{ident}", customer_name="客户",
        project_type=None,
        parties=[], contract_amount=None, signed_date=None, started_date=None,
        planned_delivery_date=None, status="active", progress=20, stage="executing",
        budget=None, cost=None, planned_days=None, used_days=None, quality_issues=None,
        satisfaction=None, acceptance_result=None, risk_config=None, notes=None,
        created_at=now, updated_at=now)


def test_helpers_and_date_validation(fake_session):
    assert projects._canonical_pair(9, 2) == (2, 9)
    with pytest.raises(HTTPException): projects._canonical_pair(2, 2)
    party = SimpleNamespace(role="甲方", name="客户", contact=None)
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
    response = asyncio.run(projects.list_projects(1, 20, "客户", "active", "客", None, "软件销售", fake_session, users.member))
    assert response.total == 1 and response.items[0].code == "P1"
    list_sql = str(fake_session.execute.call_args.args[0])
    assert "project.project_type" in list_sql and "project_member.user_id" in list_sql
    response = asyncio.run(projects.list_projects(2, 5, None, None, None, None, None, fake_session, users.admin))
    assert response.page == 2


def test_create_update_project(fake_session, users, now, monkeypatch):
    payload = ProjectCreate(name="新项目", project_type="正版化服务", customer_name="客户",
        parties=[ProjectParty(role="甲方", name="客户")], signed_date=date(2026, 1, 1),
        started_date=date(2026, 1, 2), planned_delivery_date=date(2026, 2, 1))
    async def refresh(obj):
        obj.id = 3; obj.created_at = obj.updated_at = now
        obj.stage = obj.budget = obj.cost = obj.planned_days = obj.used_days = None
        obj.quality_issues = obj.satisfaction = obj.acceptance_result = None
    fake_session.refresh.side_effect = refresh
    created = asyncio.run(projects.create_project(payload, fake_session, users.admin))
    assert created.code and created.project_type == "正版化服务"

    existing = project(now, 3)
    fake_session.get.return_value = existing
    monkeypatch.setattr(projects, "require_project_role", AsyncMock())
    updated = asyncio.run(projects.update_project(3, ProjectUpdate(name="已更新", parties=[]), fake_session, users.member))
    assert updated.name == "已更新" and updated.parties == []


def test_project_type_validation():
    payload = ProjectCreate(name="项目", code="P", customer_name="客户", project_type="软件销售")
    assert payload.project_type == "软件销售"
    with pytest.raises(ValidationError):
        ProjectCreate(name="项目", code="P", customer_name="客户", project_type="其他")


def test_project_detail_and_risks(fake_session, users, now, monkeypatch):
    p = project(now)
    fake_session.get.return_value = p
    fake_session.execute.side_effect = [Result([]), Result([])]
    monkeypatch.setattr(projects, "require_project_role", AsyncMock())
    detail = asyncio.run(projects.get_project(1, fake_session, users.member))
    assert detail.id == 1 and detail.latest_summary is None

    monkeypatch.setattr(projects.DeliverableService, "list_with_state", AsyncMock(return_value=[]))
    risk = asyncio.run(projects.get_project_risks(1, fake_session, users.member))
    assert risk.level in {"ok", "warn", "block"}
    config = asyncio.run(projects.get_project_risk_config(1, fake_session, users.member))
    assert config.project_id == "1"
    changed = config.model_copy(update={"progress_warn_threshold": 70})
    result = asyncio.run(projects.update_project_risk_config(1, changed, fake_session, users.member))
    assert result.progress_warn_threshold == 70 and p.risk_config


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
