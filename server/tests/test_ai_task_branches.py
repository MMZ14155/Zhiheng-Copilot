import asyncio
from unittest.mock import AsyncMock

from app.core.config import Settings
from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.summary import Summary
from app.models.task import Task
from app.models.tracked_file import TrackedFile
from app.schemas.ai import SummaryGenerationOutput
from app.services import ai_tasks
from app.services.ai_tasks import AiTaskExecutor, NullFileContentExtractor, create_file_content_extractor
from tests.conftest import Result


class ContextSession:
    def __init__(self, session): self.session = session
    async def __aenter__(self): return self.session
    async def __aexit__(self, *args): return False


def test_extractor_factory_and_null():
    assert asyncio.run(NullFileContentExtractor().extract_text("x")) is None
    settings = Settings(LLM_PROVIDER="mock")
    assert isinstance(create_file_content_extractor(settings), NullFileContentExtractor)
    settings = Settings(LLM_PROVIDER="kimi", KIMI_API_KEY="key")
    assert create_file_content_extractor(settings).__class__.__name__ == "KimiFileContentExtractor"


def test_run_ignores_unknown_and_completes(fake_session, monkeypatch):
    fake_session.get.return_value = None
    monkeypatch.setattr(ai_tasks, "AsyncSessionLocal", lambda: ContextSession(fake_session))
    asyncio.run(AiTaskExecutor.run(1))
    fake_session.commit.assert_not_awaited()

    task = Task(id=1, task_type="summary_generation", status="pending", payload={})
    fake_session.get.return_value = task
    work = AsyncMock()
    monkeypatch.setattr(AiTaskExecutor, "_summary", work)
    asyncio.run(AiTaskExecutor.run(1))
    assert task.status == "completed"
    assert fake_session.commit.await_count == 2
    work.assert_awaited_once()


def test_run_failure_marks_task_and_parse_status(fake_session, monkeypatch):
    task = Task(id=1, task_type="contract_recognition", status="pending", payload={"version": "a" * 64})
    version = FileVersion(version="a" * 64, parse_status="processing")
    fake_session.get.side_effect = [task, task, version]
    monkeypatch.setattr(ai_tasks, "AsyncSessionLocal", lambda: ContextSession(fake_session))
    monkeypatch.setattr(AiTaskExecutor, "_extract", AsyncMock(side_effect=ValueError("boom")))
    asyncio.run(AiTaskExecutor.run(1))
    assert task.status == "failed" and task.failure_reason == "boom"
    assert version.parse_status == "failed"
    fake_session.rollback.assert_awaited_once()


def test_summary_increments_version_and_records_inputs(fake_session, monkeypatch):
    project = Project(id=3, name="P", progress=50, notes=None)
    tracked = TrackedFile(id=4, current_version="a" * 64, name="合同", category="合同", required=True)
    task = Task(id=5, project_id=3, payload={})
    fake_session.scalar.side_effect = [project, 2]
    fake_session.execute.return_value = Result([tracked])
    async def call(self, **kwargs):
        return SummaryGenerationOutput(content="ok", core_info={"x": 1})
    monkeypatch.setattr(ai_tasks.LoggedLlmClient, "call", call)
    asyncio.run(AiTaskExecutor._summary(fake_session, task))
    summaries = [x for x in fake_session.added if isinstance(x, Summary)]
    assert summaries[0].version_no == 3 and summaries[0].content == "ok"
    assert task.payload["version_no"] == 3


def test_summary_regeneration_rejects_wrong_base(fake_session):
    project = Project(id=3)
    task = Task(project_id=3, payload={"base_summary_id": 2, "answers": []})
    fake_session.scalar.return_value = project
    fake_session.get.return_value = Summary(id=2, project_id=9)
    try:
        asyncio.run(AiTaskExecutor._summary(fake_session, task, regenerate=True))
    except ValueError as exc:
        assert "不存在" in str(exc)
    else:
        raise AssertionError("expected ValueError")
