import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.file_version import FileVersion
from app.models.tracked_file import TrackedFile
from app.schemas.deliverables import TrackedFileResponse
from app.services.file_versions import FileVersionService


@pytest.mark.parametrize(
    "filename",
    ["../secret.pdf", "nested/secret.pdf", r"nested\secret.pdf", ".", "..", ""],
)
def test_validate_file_rejects_path_components(filename: str) -> None:
    with pytest.raises(HTTPException) as exc_info:
        FileVersionService._validate_file(filename, 1)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "INVALID_FILE_NAME"


def test_validate_file_returns_safe_basename() -> None:
    assert FileVersionService._validate_file("report.pdf", 1) == "report.pdf"


def test_tail_query_has_deterministic_version_tiebreaker() -> None:
    statement = (
        select(FileVersion)
        .where(FileVersion.file_id == 1)
        .order_by(FileVersion.uploaded_at.desc(), FileVersion.version.desc())
        .limit(1)
    )
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))

    assert "file_version.uploaded_at DESC, file_version.version DESC" in sql


def test_tracked_file_model_has_no_persisted_status() -> None:
    assert "status" not in TrackedFile.__table__.columns
    assert all(
        constraint.name != "ck_tracked_file_status"
        for constraint in TrackedFile.__table__.constraints
    )


def test_tracked_file_response_keeps_computed_status() -> None:
    status_annotation = TrackedFileResponse.model_fields["status"].annotation

    assert "ok" in str(status_annotation)
    assert "frozen" not in str(status_annotation)


def test_storage_writer_uses_validated_filename(tmp_path: Path) -> None:
    safe_name = FileVersionService._validate_file("report.pdf", 3)

    path = FileVersionService._write_file(tmp_path / "versions", safe_name, b"pdf")

    assert Path(path).read_bytes() == b"pdf"
    assert Path(path).parent == tmp_path / "versions"


def test_append_version_rejects_existing_hash(monkeypatch: pytest.MonkeyPatch) -> None:
    session = MagicMock()
    session.get = AsyncMock(return_value=SimpleNamespace())
    monkeypatch.setattr(
        FileVersionService,
        "get_workspace_file",
        AsyncMock(return_value=SimpleNamespace(name="report.pdf", project_id=7)),
    )
    monkeypatch.setattr(
        FileVersionService,
        "get_tail_version",
        AsyncMock(return_value=SimpleNamespace(version="a" * 64)),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            FileVersionService.append_version(
                session, 3, b"content", "tester", "same upload"
            )
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "VERSION_EXISTS"


def test_append_version_maps_stale_chain_constraint_to_409(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    original_error = Exception("duplicate")
    original_error.diag = SimpleNamespace(
        constraint_name="uq_file_version_file_prev"
    )
    session = MagicMock()
    session.get = AsyncMock(return_value=None)
    session.flush = AsyncMock(
        side_effect=IntegrityError("insert", {}, original_error)
    )
    session.rollback = AsyncMock()
    monkeypatch.setattr(
        FileVersionService,
        "get_workspace_file",
        AsyncMock(return_value=SimpleNamespace(name="report.pdf", project_id=7)),
    )
    monkeypatch.setattr(
        FileVersionService,
        "get_tail_version",
        AsyncMock(
            return_value=SimpleNamespace(version="a" * 64, document_type="other")
        ),
    )
    monkeypatch.setattr(
        "app.services.file_versions.get_settings",
        lambda: SimpleNamespace(api_data_dir=str(tmp_path)),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            FileVersionService.append_version(
                session, 3, b"new content", "tester", "concurrent upload"
            )
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "VERSION_CHAIN_STALE"
    session.rollback.assert_awaited_once()
