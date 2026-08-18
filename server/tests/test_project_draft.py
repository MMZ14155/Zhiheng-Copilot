from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.main import app
from app.models.user import User


def _override_user() -> User:
    return User(id=1, login="tester", name="测试员", is_admin=True, password_hash="x")


@pytest.fixture(autouse=True)
def client() -> TestClient:
    app.dependency_overrides[get_current_user] = _override_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def sample_contract() -> bytes:
    path = Path(__file__).with_name("fixtures") / "contract_sample.pdf"
    return path.read_bytes()


@pytest.fixture(autouse=True)
def patch_llm(monkeypatch):
    """Mock LoggedLlmClient to avoid real LLM calls in project draft route."""
    from app.schemas.ai import ProjectDraftOutput

    async def fake_call(*, project_id, scene, prompt, output_schema, request_meta):
        assert scene == "project_draft"
        assert output_schema is ProjectDraftOutput
        return ProjectDraftOutput(
            name="XX采购合同建项",
            customer_name="XX局",
            parties=[{"role": "乙方", "name": "XX科技有限公司", "contact": "联系人A"}],
            contract_amount=123456.78,
            signed_date="2025-01-15",
            started_date="2025-01-20",
            planned_delivery_date="2025-06-30",
            project_type="软件销售",
            missing_fields=["原始合同编号"],
            notes="测试草稿",
        )

    monkeypatch.setattr("app.api.ai.LoggedLlmClient", lambda: type("Fake", (), {"call": fake_call}))


def test_create_project_draft_ok(client, sample_contract):
    response = client.post(
        "/api/v1/ai/project-draft",
        files={"file": ("contract.pdf", sample_contract, "application/pdf")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "XX采购合同建项"
    assert data["customer_name"] == "XX局"
    assert data["project_type"] == "软件销售"
    assert data["missing_fields"] == ["原始合同编号"]
    assert data["contract_amount"] == "123456.78"


def test_create_project_draft_file_too_large(client):
    big = b"x" * (100 * 1024 * 1024 + 1)
    response = client.post(
        "/api/v1/ai/project-draft",
        files={"file": ("contract.pdf", big, "application/pdf")},
    )
    assert response.status_code == 413


def test_create_project_draft_missing_extension(client):
    response = client.post(
        "/api/v1/ai/project-draft",
        files={"file": ("contract", b"some text", "text/plain")},
    )
    assert response.status_code == 415


def test_create_project_draft_invalid_extension(client):
    response = client.post(
        "/api/v1/ai/project-draft",
        files={"file": ("contract.exe", b"binary", "application/octet-stream")},
    )
    assert response.status_code == 415
