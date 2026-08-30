import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.main import app
from app.models.user import User


def _override_user() -> User:
    return User(id=1, login="tester", name="测试员", is_admin=True, password_hash="x")


class FakeResult:
    def __init__(self, values=()):
        self.values = list(values)

    def all(self):
        return self.values

    def first(self):
        return self.values[0] if self.values else None

    def one(self):
        if not self.values:
            raise ValueError("No row")
        return self.values[0]

    def scalars(self):
        return FakeResult(self.values)


class FakeSession:
    def __init__(self):
        self.added = []
        self.committed = 0
        self.closed = False

    def add(self, obj):
        self.added.append(obj)
        if getattr(obj, "id", None) is None:
            obj.id = 1

    async def commit(self):
        self.committed += 1

    async def refresh(self, obj):
        pass

    async def flush(self):
        pass

    async def rollback(self):
        pass

    async def close(self):
        self.closed = True

    async def scalars(self, *args, **kwargs):
        return FakeResult()

    async def execute(self, *args, **kwargs):
        return FakeResult()

    async def scalar(self, *args, **kwargs):
        return None

    async def get(self, *args, **kwargs):
        return None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()


class FakeAsyncSessionLocal:
    def __call__(self):
        return FakeSession()

    async def __aenter__(self):
        return self()

    async def __aexit__(self, *args):
        pass


@pytest.fixture(autouse=True)
def client(monkeypatch) -> TestClient:
    async def fake_run(task_id: int) -> None:
        pass

    monkeypatch.setattr("app.db.session.AsyncSessionLocal", FakeAsyncSessionLocal())
    monkeypatch.setattr("app.main.AsyncSessionLocal", FakeAsyncSessionLocal())
    monkeypatch.setattr("app.main.load_llm_overrides", lambda session: asyncio.sleep(0))
    monkeypatch.setattr("app.services.ai_tasks.AsyncSessionLocal", FakeAsyncSessionLocal())
    monkeypatch.setattr("app.services.ai_tasks.AiTaskExecutor.run", staticmethod(fake_run))

    app.dependency_overrides[get_current_user] = _override_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def sample_contract() -> bytes:
    path = Path(__file__).with_name("fixtures") / "contract_sample.pdf"
    return path.read_bytes()


@pytest.fixture(autouse=True)
def patch_llm(monkeypatch):
    """Mock LLM and file extractor to avoid real external calls in project draft task."""
    from app.schemas.ai import ProjectDraftOutput

    async def fake_call(*, task_id, scene, prompt, output_schema, request_meta):
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

    monkeypatch.setattr("app.services.ai_tasks.LoggedLlmClient", lambda: type("Fake", (), {"call": fake_call}))
    monkeypatch.setattr(
        "app.services.ai_tasks.create_file_content_extractor",
        lambda: type("FakeExtractor", (), {"extract_text": lambda self, path: "合同文本内容"})(),
    )


def _upload_files(client: TestClient, files):
    return client.post(
        "/api/v1/ai/project-draft",
        files=files,
    )


def test_create_project_draft_ok(client, sample_contract):
    response = _upload_files(
        client,
        files={"files": ("contract.pdf", sample_contract, "application/pdf")},
    )
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "pending"
    assert isinstance(data["task_id"], int)


def test_create_project_draft_multiple_files(client, sample_contract):
    response = _upload_files(
        client,
        files=[
            ("files", ("contract.pdf", sample_contract, "application/pdf")),
            ("files", ("contract.docx", sample_contract, "application/octet-stream")),
        ],
    )
    assert response.status_code == 202
    data = response.json()
    assert isinstance(data["task_id"], int)


def test_create_project_draft_file_too_large(client):
    big = b"x" * (100 * 1024 * 1024 + 1)
    response = _upload_files(
        client,
        files={"files": ("contract.pdf", big, "application/pdf")},
    )
    assert response.status_code == 413


def test_create_project_draft_missing_extension(client):
    response = _upload_files(
        client,
        files={"files": ("contract", b"some text", "text/plain")},
    )
    assert response.status_code == 415


def test_create_project_draft_invalid_extension(client):
    response = _upload_files(
        client,
        files={"files": ("contract.exe", b"binary", "application/octet-stream")},
    )
    assert response.status_code == 415


def test_create_project_draft_word_doc_allowed(client, sample_contract):
    response = _upload_files(
        client,
        files={"files": ("contract.doc", sample_contract, "application/msword")},
    )
    assert response.status_code == 202

