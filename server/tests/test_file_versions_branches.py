import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.workspace_file import WorkspaceFile
from app.services.file_versions import FileVersionService, MAX_FILE_SIZE
from tests.conftest import Result


def test_validate_file_boundaries():
    assert FileVersionService._validate_file("A.PDF", 1) == "A.PDF"
    for name in ("", "../a.pdf", "a\\b.pdf", ".", ".."):
        with pytest.raises(HTTPException) as exc:
            FileVersionService._validate_file(name, 1)
        assert exc.value.status_code == 400
    with pytest.raises(HTTPException) as exc:
        FileVersionService._validate_file("a.exe", 1)
    assert exc.value.status_code == 415
    with pytest.raises(HTTPException) as exc:
        FileVersionService._validate_file("a.pdf", MAX_FILE_SIZE + 1)
    assert exc.value.status_code == 413


def test_lookup_tail_chain_and_missing(fake_session):
    wf = WorkspaceFile(id=2, project_id=1, name="a.pdf")
    version = FileVersion(version="a" * 64)
    fake_session.execute.side_effect = [Result([wf]), Result([version]), Result([wf]), Result([version]), Result([])]
    assert asyncio.run(FileVersionService.get_workspace_file(fake_session, 2)) is wf
    assert asyncio.run(FileVersionService.get_tail_version(fake_session, 2)) is version
    assert asyncio.run(FileVersionService.get_version_chain(fake_session, 2)) == [version]
    with pytest.raises(HTTPException):
        asyncio.run(FileVersionService.get_version(fake_session, "x"))


def test_list_files_project_missing_and_success(fake_session):
    fake_session.get.return_value = None
    with pytest.raises(HTTPException):
        asyncio.run(FileVersionService.list_project_files(fake_session, 1))
    fake_session.get.return_value = Project(id=1)
    fake_session.execute.return_value = Result([(WorkspaceFile(id=2), None)])
    assert len(asyncio.run(FileVersionService.list_project_files(fake_session, 1))) == 1


def test_create_and_append_version_without_real_disk(fake_session, monkeypatch):
    monkeypatch.setattr(FileVersionService, "_write_file", lambda *args: "/tmp/a.pdf")
    wf, first = asyncio.run(FileVersionService.create_file_with_first_version(
        fake_session, 1, "a.pdf", "contract", b"one", "u", "first"))
    wf.id = 2
    assert first.prev_version is None and first.document_type == "contract"

    tail = FileVersion(version="a" * 64, file_id=2, document_type="contract")
    monkeypatch.setattr(FileVersionService, "get_workspace_file", lambda *args: _async(wf))
    monkeypatch.setattr(FileVersionService, "get_tail_version", lambda *args: _async(tail))
    fake_session.get.return_value = None
    appended = asyncio.run(FileVersionService.append_version(fake_session, 2, b"two", "u", "next"))
    assert appended.prev_version == tail.version


def _async(value):
    async def result():
        return value
    return result()


def test_append_conflicts(fake_session, monkeypatch):
    wf = WorkspaceFile(id=2, project_id=1, name="a.pdf")
    monkeypatch.setattr(FileVersionService, "get_workspace_file", lambda *args: _async(wf))
    monkeypatch.setattr(FileVersionService, "get_tail_version", lambda *args: _async(None))
    with pytest.raises(HTTPException):
        asyncio.run(FileVersionService.append_version(fake_session, 2, b"x", "u", ""))

    tail = FileVersion(version="a" * 64, file_id=2, document_type="other")
    monkeypatch.setattr(FileVersionService, "get_tail_version", lambda *args: _async(tail))
    fake_session.get.return_value = FileVersion(version="b" * 64)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(FileVersionService.append_version(fake_session, 2, b"x", "u", ""))
    assert exc.value.detail["code"] == "VERSION_EXISTS"


def test_optimistic_lock_conflict(fake_session, monkeypatch):
    wf = WorkspaceFile(id=2, project_id=1, name="a.pdf")
    tail = FileVersion(version="a" * 64, file_id=2, document_type="other")
    monkeypatch.setattr(FileVersionService, "get_workspace_file", lambda *args: _async(wf))
    monkeypatch.setattr(FileVersionService, "get_tail_version", lambda *args: _async(tail))
    monkeypatch.setattr(FileVersionService, "_write_file", lambda *args: "/tmp/a.pdf")
    fake_session.get.return_value = None
    orig = SimpleNamespace(diag=SimpleNamespace(constraint_name="uq_file_version_file_prev"))
    fake_session.flush.side_effect = IntegrityError("x", {}, orig)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(FileVersionService.append_version(fake_session, 2, b"x", "u", ""))
    assert exc.value.detail["code"] == "VERSION_CHAIN_STALE"
    fake_session.rollback.assert_awaited_once()
