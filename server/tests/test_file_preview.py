import asyncio
from unittest.mock import AsyncMock

import pytest
from docx import Document
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import files
from app.main import app
from app.models.file_version import FileVersion


def version(now, storage_path, key="a", file_id=2):
    return FileVersion(version=key * 64, file_id=file_id, prev_version=None,
        storage_path=str(storage_path), content_hash="c" * 64, size_bytes=2,
        uploaded_by="成员", changelog="", document_type="contract",
        parse_status="pending", is_frozen=False, uploaded_at=now)


def mock_lookup(fake_session, monkeypatch, fv):
    role = AsyncMock()
    monkeypatch.setattr(files, "require_project_role", role)
    monkeypatch.setattr(files.FileVersionService, "get_version", AsyncMock(return_value=fv))
    fake_session.scalar.return_value = 1
    return role


@pytest.mark.parametrize("suffix, content_type", [
    (".pdf", "application/pdf"),
    (".png", "image/png"),
    (".txt", "text/plain; charset=utf-8"),
])
def test_preview_inline_types(fake_session, users, now, monkeypatch, tmp_path, suffix, content_type):
    path = tmp_path / f"a{suffix}"
    path.write_bytes(b"data")
    fv = version(now, path)
    role = mock_lookup(fake_session, monkeypatch, fv)
    response = asyncio.run(files.preview_version(fv.version, fake_session, users.member))
    assert response.headers["content-type"] == content_type
    assert response.headers["content-disposition"].startswith("inline; filename*=UTF-8''")
    assert response.headers["x-content-type-options"] == "nosniff"
    role.assert_awaited_with(fake_session, 1, users.member)


@pytest.mark.parametrize("suffix", [".svg", ".html"])
def test_preview_rejects_unsupported_types(fake_session, users, now, monkeypatch, tmp_path, suffix):
    path = tmp_path / f"a{suffix}"
    path.write_bytes(b"data")
    fv = version(now, path)
    mock_lookup(fake_session, monkeypatch, fv)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(files.preview_version(fv.version, fake_session, users.member))
    assert exc.value.status_code == 415
    assert "下载" in exc.value.detail["detail"]


def test_preview_docx_inline(fake_session, users, now, monkeypatch, tmp_path):
    path = tmp_path / "a.docx"
    doc = Document()
    doc.add_paragraph("hello")
    doc.save(str(path))
    fv = version(now, path)
    role = mock_lookup(fake_session, monkeypatch, fv)
    response = asyncio.run(files.preview_version(fv.version, fake_session, users.member))
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert response.headers["content-disposition"].startswith("inline; filename*=UTF-8''")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert b"<p>hello</p>" in response.body
    role.assert_awaited_with(fake_session, 1, users.member)


def test_preview_rejects_non_member(fake_session, users, now, monkeypatch, tmp_path):
    path = tmp_path / "a.pdf"
    path.write_bytes(b"pdf")
    fv = version(now, path)
    role = mock_lookup(fake_session, monkeypatch, fv)
    role.side_effect = HTTPException(
        status_code=403,
        detail={"detail": "无权执行此操作", "code": "FORBIDDEN"},
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(files.preview_version(fv.version, fake_session, users.member))
    assert exc.value.status_code == 403


def test_preview_rejects_anonymous():
    response = TestClient(app).get("/api/v1/versions/unknown/preview")
    assert response.status_code == 401 and response.json() == {"detail": "请先登录", "code": "UNAUTHORIZED"}
