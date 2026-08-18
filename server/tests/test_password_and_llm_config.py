import asyncio
import json
from decimal import Decimal
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api import admin as admin_api
from app.api import auth as auth_api
from app.core.config import Settings
from app.core.security import hash_password, verify_password
from app.schemas.admin import LlmConfigUpdate
from app.schemas.auth import ChangePasswordRequest
from app.services.ai_tasks import KimiFileContentExtractor, create_file_content_extractor
from app.services.llm_kimi import KimiLlmProvider, create_llm_provider
from app.services.settings_store import get_effective_llm_settings, replace_overrides


@pytest.fixture(autouse=True)
def clear_runtime_overrides():
    replace_overrides({})
    yield
    replace_overrides({})


def test_change_password_revokes_all_tokens(fake_session, users):
    users.member.password_hash = hash_password("old-password")
    payload = ChangePasswordRequest(old_password="old-password", new_password="new-password")

    asyncio.run(auth_api.change_password(payload, users.member, fake_session))

    assert verify_password("new-password", users.member.password_hash)
    fake_session.execute.assert_awaited_once()
    statement = str(fake_session.execute.await_args.args[0])
    assert "DELETE FROM auth_token" in statement
    assert "auth_token.user_id" in statement
    fake_session.commit.assert_awaited_once()


def test_change_password_rejects_wrong_old_password(fake_session, users):
    users.member.password_hash = hash_password("old-password")
    payload = ChangePasswordRequest(old_password="wrong-password", new_password="new-password")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(auth_api.change_password(payload, users.member, fake_session))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail["detail"] == "原密码错误"
    fake_session.commit.assert_not_awaited()


def test_change_password_rejects_weak_password():
    with pytest.raises(ValidationError):
        ChangePasswordRequest(old_password="old-password", new_password="short")


def test_runtime_overrides_apply_to_both_factories():
    replace_overrides(
        {
            "provider": "kimi",
            "api_key": "runtime-secret-1234",
            "base_url": "https://runtime.example/v1",
            "model": "runtime-model",
            "timeout_seconds": "23",
            "input_price_per_mtok": "2.5",
            "output_price_per_mtok": "7.5",
        }
    )

    provider = create_llm_provider(Settings())
    extractor = create_file_content_extractor(Settings())

    assert isinstance(provider, KimiLlmProvider)
    assert provider.model_name == "runtime-model"
    assert isinstance(extractor, KimiFileContentExtractor)
    assert get_effective_llm_settings(Settings()).source == "db"


def test_llm_config_mask_and_env_fallback(monkeypatch):
    monkeypatch.setenv("KIMI_API_KEY", "environment-key-5678")
    settings = Settings(KIMI_API_KEY="environment-key-5678")
    monkeypatch.setattr(admin_api, "get_effective_llm_settings", lambda: get_effective_llm_settings(settings))

    response = admin_api._llm_config_response()
    assert response.api_key_set is True
    assert response.api_key_masked == "****5678"
    assert "environment-key-5678" not in response.model_dump_json()
    assert response.source == "env"


def test_empty_api_key_update_deletes_db_override(fake_session, monkeypatch):
    monkeypatch.setenv("KIMI_API_KEY", "environment-key-5678")
    settings = Settings(KIMI_API_KEY="environment-key-5678")
    replace_overrides({"api_key": "database-key-1234"})
    fake_session.scalars.return_value = SimpleNamespace(all=lambda: [])
    monkeypatch.setattr(
        admin_api,
        "get_effective_llm_settings",
        lambda: get_effective_llm_settings(settings),
    )

    response = asyncio.run(
        admin_api.update_llm_config(LlmConfigUpdate(api_key=""), fake_session)
    )

    assert response.api_key_masked == "****5678"
    assert response.source == "env"
    statement = str(fake_session.execute.await_args.args[0])
    assert "DELETE FROM system_setting" in statement
    fake_session.commit.assert_awaited_once()


def _provider(handler):
    client = httpx.AsyncClient(
        base_url="https://runtime.example/v1",
        transport=httpx.MockTransport(handler),
        headers={"Authorization": "Bearer secret-never-return"},
    )
    return KimiLlmProvider(
        api_key="secret-never-return",
        base_url="https://runtime.example/v1",
        model="runtime-model",
        timeout_seconds=10,
        input_price_per_mtok=Decimal("0"),
        output_price_per_mtok=Decimal("0"),
        client=client,
    )


def test_llm_config_test_success_with_mock_transport(monkeypatch):
    def handler(request):
        payload = json.loads(request.content)
        assert payload["messages"][0]["content"]
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"answer":"ok"}'}}]},
        )

    monkeypatch.setattr(admin_api, "create_llm_provider", lambda: _provider(handler))
    response = asyncio.run(admin_api.test_llm_config())
    assert response.ok is True


def test_llm_config_test_failure_does_not_leak_key(monkeypatch):
    def handler(request):
        return httpx.Response(401, json={"message": "secret-never-return"})

    monkeypatch.setattr(admin_api, "create_llm_provider", lambda: _provider(handler))
    response = asyncio.run(admin_api.test_llm_config())
    assert response.ok is False
    assert "secret-never-return" not in response.model_dump_json()
