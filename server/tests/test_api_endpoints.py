import asyncio
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, UploadFile

from app.api import ai, auth, copilot, deliverables, files, statistics
from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.summary import Summary
from app.models.tag import Tag
from app.models.tag_snapshot import TagSnapshot
from app.models.task import Task
from app.models.tracked_file import TrackedFile
from app.models.workspace_file import WorkspaceFile
from app.schemas.ai import SummaryAnswer, SummaryAnswersRequest
from app.schemas.copilot import CopilotAnswerOutput, CopilotAskRequest
from app.schemas.deliverables import CurrentVersionUpdate, TagCreate, TagSnapshotCreate, TrackedFileCreate
from app.services.statistics import FinancialDocument
from tests.conftest import Result


def async_value(value):
    async def inner(*args, **kwargs): return value
    return inner


def version(now, key="a", file_id=2):
    return FileVersion(version=key * 64, file_id=file_id, prev_version=None,
        storage_path="/tmp/a.pdf", content_hash="c" * 64, size_bytes=2,
        uploaded_by="成员", changelog="", document_type="contract",
        parse_status="pending", is_frozen=False, uploaded_at=now)


def tracked(now):
    return TrackedFile(id=4, project_id=1, source_file_id=2, name="合同", category="合同",
        required=True, current_version="a" * 64, created_at=now, updated_at=now)


def test_files_endpoints(fake_session, users, now, monkeypatch, tmp_path):
    monkeypatch.setattr(files, "require_project_role", AsyncMock())
    wf = WorkspaceFile(id=2, project_id=1, name="a.pdf", is_deliverable=False, created_at=now, updated_at=now)
    fv = version(now)
    monkeypatch.setattr(files.FileVersionService, "list_project_files", AsyncMock(return_value=[(wf, fv)]))
    response = asyncio.run(files.list_project_files(1, fake_session, users.member))
    assert response.files[0].latest_version.version == "a" * 64

    upload = UploadFile(filename="a.pdf", file=__import__("io").BytesIO(b"ok"))
    monkeypatch.setattr(files.FileVersionService, "create_file_with_first_version", AsyncMock(return_value=(wf, fv)))
    created = asyncio.run(files.create_file(1, "a.pdf", file=upload, session=fake_session, user=users.member))
    assert created.file_id == 2
    with pytest.raises(HTTPException):
        asyncio.run(files.create_file(1, "a.pdf", file=None, session=fake_session, user=users.member))

    fake_session.scalar.return_value = 1
    monkeypatch.setattr(files.FileVersionService, "append_version", AsyncMock(return_value=fv))
    appended = asyncio.run(files.append_version(2, file=upload, session=fake_session, user=users.member))
    assert appended.version == fv.version
    monkeypatch.setattr(files.FileVersionService, "get_version_chain", AsyncMock(return_value=[fv]))
    assert len(asyncio.run(files.list_versions(2, fake_session, users.member)).versions) == 1

    path = tmp_path / "a.pdf"; path.write_bytes(b"pdf"); fv.storage_path = str(path)
    monkeypatch.setattr(files.FileVersionService, "get_version", AsyncMock(return_value=fv))
    fake_session.scalar.return_value = 1
    download = asyncio.run(files.download_version(fv.version, fake_session, users.member))
    assert download.media_type == "application/pdf"
    assert download.path == str(path)
    files.require_project_role.assert_awaited_with(fake_session, 1, users.member)

    files.require_project_role.side_effect = HTTPException(
        status_code=403,
        detail={"detail": "无权执行此操作", "code": "FORBIDDEN"},
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(files.download_version(fv.version, fake_session, users.member))
    assert exc.value.status_code == 403
    files.require_project_role.side_effect = None
    fv.storage_path = str(tmp_path / "missing.pdf")
    with pytest.raises(HTTPException):
        asyncio.run(files.download_version(fv.version, fake_session, users.member))


def test_deliverable_endpoints(fake_session, users, now, monkeypatch):
    monkeypatch.setattr(deliverables, "require_project_role", AsyncMock())
    item, fv = tracked(now), version(now)
    monkeypatch.setattr(deliverables.DeliverableService, "promote", AsyncMock(return_value=item))
    monkeypatch.setattr(deliverables.DeliverableService, "list_with_state", AsyncMock(return_value=[(item, [fv], "ok")]))
    out = asyncio.run(deliverables.promote_tracked_file(1, TrackedFileCreate(source_file_id=2, category="合同", required=True), fake_session, users.member))
    assert out.status == "ok"
    assert len(asyncio.run(deliverables.list_tracked_files(1, fake_session, users.member)).items) == 1

    fake_session.get.return_value = item
    monkeypatch.setattr(deliverables.DeliverableService, "switch_current_version", AsyncMock(return_value=item))
    switched = asyncio.run(deliverables.switch_current_version(4, CurrentVersionUpdate(version=fv.version), fake_session, users.member))
    assert switched.current_version == fv.version

    monkeypatch.setattr(deliverables.DeliverableService, "require_project", AsyncMock())
    async def refresh(obj):
        obj.id = getattr(obj, "id", None) or 7; obj.created_at = now
    fake_session.refresh.side_effect = refresh
    tag = asyncio.run(deliverables.create_tag(1, TagCreate(name="里程碑", type="demo", created_by="成员"), fake_session, users.member))
    assert tag.id == 7
    fake_session.execute.return_value = Result([Tag(id=7, project_id=1, name="里程碑", type="demo", created_by="成员", created_at=now)])
    assert len(asyncio.run(deliverables.list_tags(1, fake_session, users.member)).items) == 1

    snap = TagSnapshot(id=8, tag_id=7, source_file_id=2, file_version=fv.version, name="快照", note=None, created_at=now)
    fake_session.get.return_value = Tag(id=7, project_id=1)
    monkeypatch.setattr(deliverables.TagService, "create_snapshot", AsyncMock(return_value=snap))
    monkeypatch.setattr(deliverables.TagService, "require_tag", AsyncMock())
    assert asyncio.run(deliverables.create_tag_snapshot(7, TagSnapshotCreate(source_file_id=2, version=fv.version), fake_session, users.member)).id == 8
    fake_session.execute.return_value = Result([snap])
    assert len(asyncio.run(deliverables.list_tag_snapshots(7, fake_session, users.member)).items) == 1


def test_ai_endpoints(fake_session, now, monkeypatch):
    project = Project(id=1)
    async def refresh(obj): obj.id = getattr(obj, "id", None) or 10
    fake_session.refresh.side_effect = refresh
    fake_session.get.return_value = project
    bg = SimpleNamespace(add_task=lambda *args: None)
    assert asyncio.run(ai.create_summary_task(1, bg, fake_session)).task_id == 10

    latest = Summary(id=3, project_id=1, version_no=1, pending_questions=["进度？"])
    fake_session.scalar.return_value = latest
    body = SummaryAnswersRequest(answers=[SummaryAnswer(question="进度？", answer="完成"), SummaryAnswer(question="其他", answer="无")])
    regen = asyncio.run(ai.create_summary_regeneration_task(1, body, bg, fake_session))
    assert regen.accepted_questions == ["进度？"] and regen.ignored_questions == ["其他"]

    fv = version(now); fake_session.get.return_value = fv
    task = asyncio.run(ai.create_extract_task(fv.version, bg, fake_session))
    assert task.task_id == 10 and fv.parse_status == "processing"

    info = SimpleNamespace(id=2, version=fv.version, contract_no=None, party_a=None, party_b=None,
        amount=None, signed_date=None, payment_terms=[], missing_fields=[], raw_output={}, created_at=now)
    fake_session.scalar.return_value = info
    assert asyncio.run(ai.get_extract(fv.version, fake_session)).type == "contract"

    task_obj = Task(id=10, project_id=1, task_type="summary_generation", status="completed", payload={},
        failure_reason=None, started_at=now, finished_at=now, created_at=now, updated_at=now)
    fake_session.get.return_value = task_obj
    fake_session.execute.return_value = Result(one=(1, 2, 3, Decimal("0.1")))
    assert asyncio.run(ai.get_task(10, fake_session)).llm_usage.call_count == 1


def test_auth_login_and_me(fake_session, users, monkeypatch):
    from app.core.security import hash_password
    users.member.password_hash = hash_password("secret")
    fake_session.scalar.return_value = users.member
    monkeypatch.setattr(auth.secrets, "token_urlsafe", lambda n: "token")
    response = asyncio.run(auth.login(SimpleNamespace(login="member", password="secret"), fake_session))
    assert response.token == "token" and fake_session.added
    assert asyncio.run(auth.me(users.admin)).is_admin is True
    with pytest.raises(HTTPException):
        asyncio.run(auth.login(SimpleNamespace(login="member", password="bad"), fake_session))


def test_statistics_member_filter(fake_session, users, monkeypatch):
    project = Project(id=1, stage="executing", budget=Decimal("100"), cost=Decimal("50"), planned_days=10,
        used_days=5, satisfaction=Decimal("4"), progress=50, quality_issues=0,
        acceptance_result="pending", status="active", project_type="软件销售",
        planned_delivery_date=date(2026, 9, 30))
    fake_session.scalars.return_value = Result([1]).scalars()
    fake_session.execute.return_value = Result([project])
    fake_session.scalar.return_value = 2
    monkeypatch.setattr(statistics, "_load_deliverable_states", AsyncMock(return_value={}))
    load_finance = AsyncMock(return_value={1: [FinancialDocument(
        project_id=1, file_id=1, version="v1", kind="contract", amount=Decimal("100"),
        created_at="2026-01-01", contract_no="C1", signed_date=date(2026, 1, 1),
        payment_terms=({"stage": "签订", "ratio": "100%"},),
    )]})
    monkeypatch.setattr(statistics, "load_financial_documents", load_finance)
    response = asyncio.run(statistics.get_statistics_overview(fake_session, users.member))
    assert response.projects.total == 1 and response.files.workspace_file_total == 2
    assert response.project_type_distribution == {"软件销售": 1}
    assert response.payment.contract_amount == Decimal("100")
    load_finance.assert_awaited_once_with(fake_session, [1])


def test_copilot_aggregate_and_access(fake_session, users, monkeypatch):
    project = Project(id=1, code="P", name="项目")
    fake_session.scalars.return_value = Result([project]).scalars()
    monkeypatch.setattr(copilot, "_project_context", AsyncMock(return_value={"id": 1, "code": "P", "name": "项目", "risk_level": "ok", "risks": [], "latest_summary": None}))
    async def call(self, **kwargs): return CopilotAnswerOutput(answer="正常", references=[])
    monkeypatch.setattr(copilot.LoggedLlmClient, "call", call)
    answer = asyncio.run(copilot.ask_copilot(CopilotAskRequest(question="状态", project_id=None), fake_session, users.member))
    assert answer.answer == "正常"
    with pytest.raises(HTTPException):
        asyncio.run(copilot.ask_copilot(CopilotAskRequest(question="   "), fake_session, users.admin))

    fake_session.get.return_value = project
    monkeypatch.setattr(copilot, "require_project_role", AsyncMock(side_effect=HTTPException(403, "x")))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(copilot.ask_copilot(CopilotAskRequest(question="状态", project_id=1), fake_session, users.member))
    assert exc.value.status_code == 403
