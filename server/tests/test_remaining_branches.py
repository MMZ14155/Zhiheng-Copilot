import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.api import dependencies, statistics
from app.core.config import get_settings
from app.models.auth_token import AuthToken
from app.models.file_version import FileVersion
from app.models.project_member import ProjectMember
from app.models.tracked_file import TrackedFile
from app.schemas.ai import ContractExtractionOutput
from app.services.deliverables import DeliverableService
from app.services.llm_kimi import KimiFileContentExtractor, KimiLlmProvider, KimiProviderError
from tests.conftest import Result
from tests.test_llm_kimi import _make_extractor, _make_provider, _chat_response


def test_auth_dependency_branches(fake_session, users, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_disabled", True)
    assert asyncio.run(dependencies.get_current_user(None, fake_session)).is_admin
    monkeypatch.setattr(get_settings(), "auth_disabled", False)
    with pytest.raises(HTTPException): asyncio.run(dependencies.get_current_user(None, fake_session))

    credentials = SimpleNamespace(scheme="Bearer", credentials="token")
    expired = AuthToken(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    fake_session.execute.return_value = Result([SimpleNamespace(AuthToken=expired, User=users.member)])
    with pytest.raises(HTTPException): asyncio.run(dependencies.get_current_user(credentials, fake_session))
    valid = AuthToken(expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    fake_session.execute.return_value = Result([SimpleNamespace(AuthToken=valid, User=users.member)])
    assert asyncio.run(dependencies.get_current_user(credentials, fake_session)) is users.member

    assert asyncio.run(dependencies.require_project_role(fake_session, 1, users.admin)) is None
    fake_session.scalar.return_value = None
    with pytest.raises(HTTPException): asyncio.run(dependencies.require_project_role(fake_session, 1, users.member))
    member = ProjectMember(project_id=1, user_id=2, role="viewer")
    fake_session.scalar.return_value = member
    with pytest.raises(HTTPException): asyncio.run(dependencies.require_project_role(fake_session, 1, users.member, {"manager"}))
    assert asyncio.run(dependencies.require_project_role(fake_session, 1, users.member)) is member


def test_statistics_load_states(fake_session, now):
    tracked = TrackedFile(id=1, project_id=3, source_file_id=2, name="合同", category="合同", required=True, current_version="a" * 64)
    fv = FileVersion(version="a" * 64, file_id=2, is_frozen=False, uploaded_at=now)
    fake_session.execute.side_effect = [Result([tracked]), Result([fv]), Result([(fv, SimpleNamespace())])]
    grouped = asyncio.run(statistics._load_deliverable_states(fake_session, [3]))
    assert grouped[3][0].unfrozen_versions == 1

    fake_session.execute.side_effect = [Result([])]
    assert asyncio.run(statistics._load_deliverable_states(fake_session, [])) == {}


def test_deliverable_list_with_state(fake_session, now):
    tracked = TrackedFile(id=1, project_id=3, source_file_id=2, name="合同", category="合同", required=True, current_version="a" * 64)
    fv = FileVersion(version="a" * 64, file_id=2, is_frozen=True, uploaded_at=now)
    fake_session.get.return_value = SimpleNamespace(id=3)
    fake_session.execute.side_effect = [Result([tracked]), Result([fv]), Result([(fv, SimpleNamespace())])]
    rows = asyncio.run(DeliverableService.list_with_state(fake_session, 3))
    assert rows[0][2] == "ok"


def test_kimi_additional_error_branches(tmp_path):
    missing = _make_extractor(lambda request: httpx.Response(200))
    with pytest.raises(KimiProviderError): asyncio.run(missing.extract_text(str(tmp_path / "none.pdf")))
    unsupported = tmp_path / "x.exe"; unsupported.write_bytes(b"x")
    with pytest.raises(KimiProviderError): asyncio.run(missing.extract_text(str(unsupported)))

    for response in (
        httpx.Response(200, content=b"not-json"),
        httpx.Response(200, json={"choices": []}),
        _chat_response("[]"),
    ):
        provider = _make_provider(lambda request, response=response: response)
        with pytest.raises(KimiProviderError):
            asyncio.run(provider.generate("x", ContractExtractionOutput))


def test_kimi_upload_fetch_and_delete_edges(tmp_path):
    path = tmp_path / "x.pdf"; path.write_bytes(b"x")
    extractor = _make_extractor(lambda request: httpx.Response(500))
    with pytest.raises(KimiProviderError): asyncio.run(extractor.extract_text(str(path)))

    extractor = _make_extractor(lambda request: httpx.Response(200, json={}))
    with pytest.raises(KimiProviderError): asyncio.run(extractor.extract_text(str(path)))

    calls = []
    def handler(request):
        calls.append(request.method)
        if request.method == "POST": return httpx.Response(200, json={"id": "f"})
        if request.method == "GET": return httpx.Response(200, text="plain text")
        return httpx.Response(500)
    assert asyncio.run(_make_extractor(handler).extract_text(str(path))) == "plain text"
    assert calls == ["POST", "GET", "DELETE"]
