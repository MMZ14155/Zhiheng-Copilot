import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api.ai import create_extract_task, get_extract
from app.models.contract_info import ContractInfo
from app.models.file_version import FileVersion
from app.models.invoice_info import InvoiceInfo
from app.models.payment_info import PaymentInfo
from app.models.task import Task
from app.schemas.files import FileVersionCreate
from app.services.ai_tasks import create_extraction_task

ADMIN = SimpleNamespace(id=1, is_admin=True)


def test_changelog_defaults_to_empty_string():
    assert FileVersionCreate(uploaded_by="成员").changelog == ""


@pytest.mark.parametrize(
    ("document_type", "creates_task"),
    [("contract", True), ("invoice", True), ("payment", True), (None, False), ("other", False)],
)
def test_create_extraction_task_routes_supported_types(fake_session, document_type, creates_task):
    version = FileVersion(
        version="a" * 64,
        document_type=document_type,
        parse_status="pending",
    )

    task = asyncio.run(create_extraction_task(fake_session, version))

    assert (task is not None) is creates_task
    if creates_task:
        assert isinstance(task, Task)
        assert task.payload == {
            "version": version.version,
            "document_type": document_type,
        }
        assert version.parse_status == "processing"
        fake_session.flush.assert_awaited_once()
    else:
        assert version.parse_status == "skipped"
        fake_session.flush.assert_not_awaited()


@pytest.mark.parametrize("document_type", ["contract", "invoice", "payment"])
def test_create_extract_task_accepts_material_types(document_type):
    file_version = SimpleNamespace(
        document_type=document_type, parse_status="pending", file_id=1
    )
    session = AsyncMock()
    session.add = Mock()
    session.get.return_value = file_version
    session.scalar.return_value = 1
    session.refresh.side_effect = lambda task: setattr(task, "id", 1)

    response = asyncio.run(create_extract_task("a" * 64, BackgroundTasks(), session, ADMIN))

    assert response.task_id == 1
    added_task = session.add.call_args.args[0]
    assert added_task.payload["document_type"] == document_type
    assert file_version.parse_status == "processing"


@pytest.mark.parametrize("document_type", [None, "other"])
def test_create_extract_task_rejects_non_material_versions(document_type):
    session = AsyncMock()
    session.get.return_value = SimpleNamespace(document_type=document_type, file_id=1)
    session.scalar.return_value = 1

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(create_extract_task("a" * 64, BackgroundTasks(), session, ADMIN))

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "NOT_CONTRACT_VERSION"


@pytest.mark.parametrize(
    ("document_type", "model", "response_type"),
    [
        ("contract", ContractInfo, "contract"),
        ("invoice", InvoiceInfo, "invoice"),
        ("payment", PaymentInfo, "payment"),
    ],
)
def test_get_extract_routes_by_document_type(document_type, model, response_type):
    session = AsyncMock()
    session.get.return_value = SimpleNamespace(document_type=document_type, file_id=1)
    values = {field: None for field in model.__table__.columns.keys()}
    values.update(
        id=1,
        version="a" * 64,
        missing_fields=[],
        raw_output={},
        created_at="2026-08-14T00:00:00Z",
    )
    if document_type == "contract":
        values["payment_terms"] = []
    item = SimpleNamespace(**values)
    session.scalar.return_value = item

    response = asyncio.run(get_extract("a" * 64, session, ADMIN))

    assert response.type == response_type
    selected_model = session.scalar.call_args.args[0].column_descriptions[0]["entity"]
    assert selected_model is model
