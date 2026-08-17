import asyncio
from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from unittest.mock import AsyncMock
from app.api import snapshots as snapshot_api
from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.snapshot import Snapshot
from app.models.workspace_file import WorkspaceFile
from app.services.snapshots import SnapshotService
from tests.conftest import Result

def test_snapshot_hash_is_canonical_sha256():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    first = SnapshotService.calculate_hash(None, [(2, "b.pdf", "b" * 64), (1, "a.pdf", "a" * 64)], "张三", "上传", now)
    second = SnapshotService.calculate_hash(None, [(1, "a.pdf", "a" * 64), (2, "b.pdf", "b" * 64)], "张三", "上传", now)
    assert first == second and len(first) == 64
    assert all(char in "0123456789abcdef" for char in first)

def test_create_snapshot_tree_and_conflict(fake_session, monkeypatch):
    project, wf = Project(id=1), WorkspaceFile(id=2, project_id=1, name="a.pdf")
    version = FileVersion(version="a" * 64, file_id=2)
    async def heads(*args): return [(wf, version)]
    monkeypatch.setattr(SnapshotService, "_heads", heads)
    snapshot = asyncio.run(SnapshotService.create_snapshot(fake_session, project, None, "u", "m"))
    assert len(snapshot.hash) == 64 and fake_session.added[-1].version == version.version
    orig = type("Orig", (), {"diag": type("Diag", (), {"constraint_name": "uq_snapshot_project_parent"})()})()
    fake_session.flush.side_effect = IntegrityError("x", {}, orig)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(SnapshotService.create_snapshot(fake_session, project, None, "u", "m"))
    assert exc.value.status_code == 409 and exc.value.detail["code"] == "SNAPSHOT_STALE"

def test_restore_reuses_storage_resets_parse_and_skips_frozen(fake_session, monkeypatch, tmp_path):
    target_path = tmp_path / "a.pdf"; target_path.write_bytes(b"target")
    target, current_snapshot = Snapshot(hash="1" * 64, project_id=1), Snapshot(hash="2" * 64, project_id=1)
    wf1, wf2 = WorkspaceFile(id=1, project_id=1, name="a.pdf"), WorkspaceFile(id=2, project_id=1, name="b.pdf")
    current1 = FileVersion(version="a" * 64, file_id=1, is_frozen=False)
    current2 = FileVersion(version="b" * 64, file_id=2, is_frozen=True)
    target1 = FileVersion(version="c" * 64, file_id=1, storage_path=str(target_path), content_hash="d" * 64,
                          size_bytes=6, document_type="contract", is_frozen=False)
    target2 = FileVersion(version="e" * 64, file_id=2, storage_path=str(target_path), is_frozen=False)
    entry1 = type("Entry", (), {"file_id": 1, "path": "a.pdf"})()
    entry2 = type("Entry", (), {"file_id": 2, "path": "b.pdf"})()
    fake_session.execute.return_value = Result([(entry1, target1), (entry2, target2)])
    fake_session.get.side_effect = [None, Project(id=1)]
    async def latest(*args): return current_snapshot
    async def heads(*args): return [(wf1, current1), (wf2, current2)]
    async def create(*args): return Snapshot(hash="f" * 64, project_id=1)
    monkeypatch.setattr(SnapshotService, "latest", latest)
    monkeypatch.setattr(SnapshotService, "_heads", heads)
    monkeypatch.setattr(SnapshotService, "create_snapshot", create)
    snapshot, count, skipped = asyncio.run(SnapshotService.restore(fake_session, target, "manager"))
    restored = next(item for item in fake_session.added if isinstance(item, FileVersion))
    assert snapshot.hash == "f" * 64 and count == 1
    assert restored.storage_path == target1.storage_path and restored.parse_status == "pending"
    assert restored.document_type == "contract" and restored.snapshot_hash == snapshot.hash
    assert skipped == [{"file_id": 2, "path": "b.pdf", "reason": "版本已冻结"}]

def test_snapshot_endpoints_apply_membership_and_manager_role(fake_session, users, now, monkeypatch):
    snapshot = Snapshot(hash="a" * 64, project_id=1, parent_hash=None, author="u",
                        message="m", created_at=now)
    fake_session.execute.side_effect = [Result([(snapshot, 1)]), Result([])]
    role_check = AsyncMock()
    monkeypatch.setattr(snapshot_api, "require_project_role", role_check)
    timeline = asyncio.run(snapshot_api.list_snapshots(1, fake_session, users.member))
    assert timeline.snapshots[0].entry_count == 1
    role_check.assert_awaited_with(fake_session, 1, users.member)

    monkeypatch.setattr(snapshot_api.SnapshotService, "get", AsyncMock(return_value=snapshot))
    detail = asyncio.run(snapshot_api.get_snapshot(snapshot.hash, fake_session, users.member))
    assert detail.hash == snapshot.hash and detail.entries == []

    restored = Snapshot(hash="b" * 64, project_id=1)
    monkeypatch.setattr(snapshot_api.SnapshotService, "restore", AsyncMock(return_value=(restored, 0, [])))
    result = asyncio.run(snapshot_api.restore_snapshot(snapshot.hash, fake_session, users.member))
    assert result.snapshot == restored.hash
    role_check.assert_awaited_with(fake_session, 1, users.member, {"manager"})

    role_check.side_effect = HTTPException(status_code=403, detail={"detail": "无权执行此操作", "code": "FORBIDDEN"})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(snapshot_api.restore_snapshot(snapshot.hash, fake_session, users.member))
    assert exc.value.status_code == 403
