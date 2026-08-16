import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException

from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.tag import Tag
from app.models.tracked_file import TrackedFile
from app.models.workspace_file import WorkspaceFile
from app.services.deliverables import DeliverableService, TagService
from tests.conftest import Result


def fv(version, file_id, now, frozen=True):
    return FileVersion(version=version * 64, file_id=file_id, prev_version=None,
        storage_path="/tmp/a.pdf", content_hash="c" * 64, size_bytes=1,
        uploaded_by="u", changelog="", document_type="contract",
        parse_status="pending", is_frozen=frozen, uploaded_at=now)


def test_calculate_status_all_branches(now):
    tracked = TrackedFile(required=True, current_version=None)
    assert DeliverableService.calculate_status(tracked, [], None) == "missing"
    tracked.current_version = "b" * 64
    versions = [fv("a", 1, now, False), fv("b", 1, now + timedelta(days=1), False)]
    assert DeliverableService.calculate_status(tracked, versions, None) == "conflict"
    versions[0].is_frozen = versions[1].is_frozen = True
    assert DeliverableService.calculate_status(tracked, versions, versions[0]) == "old"
    assert DeliverableService.calculate_status(tracked, versions, versions[1]) == "ok"


def test_require_entities_and_switch_errors(fake_session, now):
    fake_session.get.return_value = None
    with pytest.raises(HTTPException):
        asyncio.run(DeliverableService.require_project(fake_session, 9))
    with pytest.raises(HTTPException):
        asyncio.run(TagService.require_tag(fake_session, 9))

    fake_session.scalar.return_value = None
    with pytest.raises(HTTPException) as exc:
        asyncio.run(DeliverableService.switch_current_version(fake_session, 9, "a" * 64))
    assert exc.value.detail["code"] == "TRACKED_FILE_NOT_FOUND"

    tracked = TrackedFile(id=1, source_file_id=2, current_version=None)
    fake_session.scalar.return_value = tracked
    fake_session.get.return_value = None
    with pytest.raises(HTTPException):
        asyncio.run(DeliverableService.switch_current_version(fake_session, 1, "a" * 64))
    fake_session.get.return_value = fv("a", 3, now)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(DeliverableService.switch_current_version(fake_session, 1, "a" * 64))
    assert exc.value.detail["code"] == "VERSION_CHAIN_MISMATCH"


def test_promote_transaction_and_existing_conflict(fake_session, now):
    project = Project(id=1)
    source = WorkspaceFile(id=2, project_id=1, name="a.pdf", is_deliverable=False)
    versions = [fv("a", 2, now), fv("b", 2, now + timedelta(days=1), False)]
    fake_session.get.return_value = project
    fake_session.scalar.side_effect = [source, None]
    fake_session.execute.side_effect = [Result(versions), Result()]
    tracked = asyncio.run(DeliverableService.promote(fake_session, 1, 2, "合同", True))
    assert tracked.current_version == "b" * 64
    assert source.is_deliverable is True
    assert tracked in fake_session.added
    assert fake_session.flush.await_count == 2

    fake_session.scalar.side_effect = [source, TrackedFile(id=8)]
    with pytest.raises(HTTPException) as exc:
        asyncio.run(DeliverableService.promote(fake_session, 1, 2, "合同", True))
    assert exc.value.detail["code"] == "FILE_ALREADY_TRACKED"


def test_snapshot_success_and_validation(fake_session, now):
    tag = Tag(id=1, project_id=3, name="审计")
    source = WorkspaceFile(id=2, project_id=3, name="a.pdf")
    version = fv("a", 2, now)
    fake_session.get.side_effect = [tag, source, version]
    fake_session.scalar.return_value = None
    snapshot = asyncio.run(TagService.create_snapshot(fake_session, 1, 2, "a" * 64, None))
    assert snapshot.note == "由标签 审计 创建的快照"
    assert snapshot in fake_session.added

    fake_session.get.side_effect = [tag, WorkspaceFile(id=2, project_id=4)]
    with pytest.raises(HTTPException):
        asyncio.run(TagService.create_snapshot(fake_session, 1, 2, "a" * 64, None))
