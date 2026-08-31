import asyncio
import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest

from app.core.config import Settings
from app.models.contract_info import ContractInfo
from app.core.extraction import MultimodalRequiredError
from app.schemas.ai import ContractExtractionOutput, ProjectDraftOutput
from app.services import ai_tasks, llm
from app.services.ai_tasks import (
    AiTaskExecutor,
    NullFileContentExtractor,
    create_file_content_extractor,
)
from app.services.llm import LoggedLlmClient, MockLlmProvider, ProviderResult
from app.services.llm_kimi import (
    KimiFileContentExtractor,
    KimiLlmProvider,
    KimiProviderError,
    create_llm_provider,
)

API_KEY = "test-kimi-key"
BASE_URL = "https://api.moonshot.cn/v1"


def _make_provider(handler, **overrides):
    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {API_KEY}"},
        transport=transport,
    )
    options = {
        "api_key": API_KEY,
        "base_url": BASE_URL,
        "model": "kimi-k2.6",
        "timeout_seconds": 60,
        "input_price_per_mtok": Decimal("2"),
        "output_price_per_mtok": Decimal("8"),
        "client": client,
    }
    options.update(overrides)
    return KimiLlmProvider(**options)


def _make_extractor(handler):
    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(
        base_url=BASE_URL,
        headers={"Authorization": f"Bearer {API_KEY}"},
        transport=transport,
    )
    return KimiFileContentExtractor(
        api_key=API_KEY, base_url=BASE_URL, timeout_seconds=60, client=client
    )


def _chat_response(content, prompt_tokens=1000, completion_tokens=500):
    return httpx.Response(
        200,
        json={
            "choices": [{"message": {"role": "assistant", "content": content}}],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
            },
        },
    )


class _FakeAuditSession:
    def __init__(self):
        self.added = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        pass


def _patch_audit_session(monkeypatch):
    fake = _FakeAuditSession()
    monkeypatch.setattr(llm, "AsyncSessionLocal", lambda: fake)
    return fake


def test_kimi_chat_request_structure_and_success_result():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers.get("authorization")
        captured["payload"] = json.loads(request.content)
        return _chat_response(
            json.dumps({"contract_no": "HT-2026-001", "missing_fields": ["签署日期"]})
        )

    provider = _make_provider(handler)
    result = asyncio.run(provider.generate("抽取合同字段", ContractExtractionOutput))

    assert captured["url"] == f"{BASE_URL}/chat/completions"
    assert captured["authorization"] == f"Bearer {API_KEY}"
    payload = captured["payload"]
    assert payload["model"] == "kimi-k2.6"
    assert payload["messages"] == [{"role": "user", "content": "抽取合同字段"}]
    assert "temperature" not in payload
    response_format = payload["response_format"]
    assert response_format["type"] == "json_schema"
    json_schema = response_format["json_schema"]
    assert json_schema["name"] == "contract_extraction_output"
    assert json_schema["strict"] is True
    assert json_schema["schema"] == ContractExtractionOutput.model_json_schema()

    assert result.data["contract_no"] == "HT-2026-001"
    assert result.input_tokens == 1000
    assert result.output_tokens == 500
    assert result.cost == Decimal("0.006000")


def test_kimi_chat_http_500_raises_and_audits_failure(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "internal"})

    fake_audit = _patch_audit_session(monkeypatch)
    client = LoggedLlmClient(provider=_make_provider(handler))

    with pytest.raises(KimiProviderError) as exc_info:
        asyncio.run(
            client.call(
                task_id=1,
                scene="contract_extraction",
                prompt="抽取合同字段",
                output_schema=ContractExtractionOutput,
            )
        )

    assert "HTTP 500" in str(exc_info.value)
    assert API_KEY not in str(exc_info.value)
    assert len(fake_audit.added) == 1
    call = fake_audit.added[0]
    assert call.success is False
    assert call.provider == "kimi"
    assert API_KEY not in (call.error_message or "")


def test_kimi_chat_timeout_raises_and_audits_failure(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout", request=request)

    fake_audit = _patch_audit_session(monkeypatch)
    client = LoggedLlmClient(provider=_make_provider(handler))

    with pytest.raises(KimiProviderError) as exc_info:
        asyncio.run(
            client.call(
                task_id=1,
                scene="contract_extraction",
                prompt="抽取合同字段",
                output_schema=ContractExtractionOutput,
            )
        )

    assert "超时" in str(exc_info.value)
    assert API_KEY not in str(exc_info.value)
    assert fake_audit.added[0].success is False


def test_kimi_chat_invalid_json_content_raises_and_audits_failure(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return _chat_response("这不是 JSON")

    fake_audit = _patch_audit_session(monkeypatch)
    client = LoggedLlmClient(provider=_make_provider(handler))

    with pytest.raises(KimiProviderError) as exc_info:
        asyncio.run(
            client.call(
                task_id=1,
                scene="contract_extraction",
                prompt="抽取合同字段",
                output_schema=ContractExtractionOutput,
            )
        )

    assert "非法 JSON" in str(exc_info.value)
    assert API_KEY not in str(exc_info.value)
    assert fake_audit.added[0].success is False


def test_kimi_chat_empty_content_raises():
    def handler(request: httpx.Request) -> httpx.Response:
        return _chat_response("")

    provider = _make_provider(handler)

    with pytest.raises(KimiProviderError) as exc_info:
        asyncio.run(provider.generate("抽取合同字段", ContractExtractionOutput))

    assert "空" in str(exc_info.value)
    assert API_KEY not in str(exc_info.value)


def test_file_extractor_upload_fetch_delete_flow(tmp_path):
    document = tmp_path / "contract.pdf"
    document.write_bytes(b"%PDF-1.4 fake")
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path))
        if request.method == "POST" and request.url.path == "/v1/files":
            assert b"file-extract" in request.content
            return httpx.Response(200, json={"id": "file-abc"})
        if request.method == "GET" and request.url.path == "/v1/files/file-abc/content":
            return httpx.Response(200, json={"content": "甲方A 乙方B 金额100万"})
        if request.method == "DELETE" and request.url.path == "/v1/files/file-abc":
            return httpx.Response(200, json={"deleted": True})
        return httpx.Response(404, json={"error": "not found"})

    extractor = _make_extractor(handler)
    text = asyncio.run(extractor.extract_text(str(document)))

    assert text == "甲方A 乙方B 金额100万"
    assert calls[0] == ("POST", "/v1/files")
    assert ("GET", "/v1/files/file-abc/content") in calls
    assert ("DELETE", "/v1/files/file-abc") in calls


def test_file_extractor_deletes_file_even_when_content_fetch_fails(tmp_path):
    document = tmp_path / "contract.pdf"
    document.write_bytes(b"%PDF-1.4 fake")
    delete_called = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path == "/v1/files":
            return httpx.Response(200, json={"id": "file-xyz"})
        if request.method == "GET":
            return httpx.Response(500, json={"error": "internal"})
        if request.method == "DELETE":
            delete_called.append(request.url.path)
            return httpx.Response(200, json={"deleted": True})
        return httpx.Response(404)

    extractor = _make_extractor(handler)

    with pytest.raises(KimiProviderError) as exc_info:
        asyncio.run(extractor.extract_text(str(document)))

    assert "HTTP 500" in str(exc_info.value)
    assert API_KEY not in str(exc_info.value)
    assert delete_called == ["/v1/files/file-xyz"]


def test_file_extractor_rejects_missing_file(tmp_path):
    extractor = _make_extractor(lambda request: httpx.Response(500))

    with pytest.raises(KimiProviderError, match="不存在"):
        asyncio.run(extractor.extract_text(str(tmp_path / "missing.pdf")))


def test_file_extractor_rejects_unsupported_extension(tmp_path):
    document = tmp_path / "archive.zip"
    document.write_bytes(b"zip")
    extractor = _make_extractor(lambda request: httpx.Response(500))

    with pytest.raises(KimiProviderError, match="不支持"):
        asyncio.run(extractor.extract_text(str(document)))


def test_file_extractor_rejects_oversize_file(tmp_path, monkeypatch):
    document = tmp_path / "big.pdf"
    document.write_bytes(b"0123456789")
    monkeypatch.setattr("app.services.llm_kimi.MAX_FILE_SIZE_BYTES", 4)
    extractor = _make_extractor(lambda request: httpx.Response(500))

    with pytest.raises(KimiProviderError, match="100MB"):
        asyncio.run(extractor.extract_text(str(document)))


def test_provider_factory_falls_back_to_mock_without_kimi_config():
    assert isinstance(create_llm_provider(Settings()), MockLlmProvider)
    assert isinstance(
        create_llm_provider(Settings(LLM_PROVIDER="kimi")), MockLlmProvider
    )


def test_provider_factory_selects_kimi_when_configured():
    provider = create_llm_provider(
        Settings(LLM_PROVIDER="kimi", KIMI_API_KEY=API_KEY)
    )
    assert isinstance(provider, KimiLlmProvider)
    assert provider.name == "kimi"
    assert provider.model_name == "kimi-k2.6"


def test_extractor_factory_falls_back_to_null_without_kimi_config():
    assert isinstance(create_file_content_extractor(Settings()), NullFileContentExtractor)
    assert asyncio.run(
        create_file_content_extractor(Settings()).extract_text("/tmp/whatever.pdf")
    ) is None


def test_extractor_factory_selects_kimi_when_configured():
    extractor = create_file_content_extractor(
        Settings(LLM_PROVIDER="kimi", KIMI_API_KEY=API_KEY)
    )
    assert isinstance(extractor, KimiFileContentExtractor)


def test_extract_injects_document_text_and_persists_result(monkeypatch, tmp_path):
    document = tmp_path / "contract.pdf"
    document.write_bytes(b"%PDF-1.4 fake")
    extracted_md = tmp_path / f"{'c' * 64}.md"
    extracted_md.write_text(
        "本合同由甲方A与乙方B于2026年签署，项目金额为1000000.00元，付款方式为验收后一次性支付。"
        "双方约定交付日期为2026年12月31日，如有争议应提交仲裁解决。",
        encoding="utf-8",
    )
    version = SimpleNamespace(
        version="b" * 64,
        document_type="contract",
        content_hash="c" * 64,
        storage_path=str(document),
        parse_status="processing",
        extract_path=str(extracted_md),
    )
    task = SimpleNamespace(id=1, payload={"version": version.version})
    session = AsyncMock()
    session.add = Mock()
    session.get.return_value = version
    session.scalar.return_value = None

    recorded = {}

    class RecordingProvider:
        name = "kimi"
        model_name = "kimi-k2.6"

        async def generate(self, prompt: str, output_schema):
            recorded["prompt"] = prompt
            data = {
                "contract_no": "HT-2026-001",
                "party_a": "甲方A",
                "party_b": "乙方B",
                "amount": "1000000.00",
                "missing_fields": ["签署日期"],
            }
            return ProviderResult(data, 1000, 500, Decimal("0.006000"))

    monkeypatch.setattr(
        "app.services.llm_kimi.create_llm_provider", lambda: RecordingProvider()
    )
    fake_audit = _patch_audit_session(monkeypatch)

    asyncio.run(AiTaskExecutor._extract(session, task))

    prompt_payload = json.loads(recorded["prompt"])
    assert prompt_payload["document_text"] == (
        "本合同由甲方A与乙方B于2026年签署，项目金额为1000000.00元，付款方式为验收后一次性支付。"
        "双方约定交付日期为2026年12月31日，如有争议应提交仲裁解决。"
    )
    assert "仅依据 document_text 抽取" in prompt_payload["instruction"]
    assert prompt_payload["required_fields"] == [
        "contract_no",
        "party_a",
        "party_b",
        "amount",
        "signed_date",
        "payment_terms",
    ]

    persisted = session.add.call_args.args[0]
    assert isinstance(persisted, ContractInfo)
    assert persisted.contract_no == "HT-2026-001"
    assert persisted.party_a == "甲方A"
    assert persisted.missing_fields == ["签署日期"]
    assert persisted.raw_output["contract_no"] == "HT-2026-001"
    assert version.parse_status == "parsed"
    assert fake_audit.added[0].success is True
    assert fake_audit.added[0].provider == "kimi"


def test_extract_without_text_falls_back_to_multimodal(monkeypatch):
    version = SimpleNamespace(
        version="b" * 64,
        document_type="contract",
        content_hash="c" * 64,
        storage_path="/data/nonexistent.pdf",
        parse_status="processing",
        extract_path=None,
    )
    task = SimpleNamespace(id=1, payload={"version": version.version})
    session = AsyncMock()
    session.get.return_value = version
    session.scalar.return_value = None
    session.add = Mock()

    async def fake_call(*args, **kwargs):
        return ContractExtractionOutput(
            contract_no="HT-2026-001",
            party_a="甲方A",
            party_b="乙方B",
            amount=Decimal("1000000.00"),
            signed_date="2026-01-01",
            missing_fields=["payment_terms"],
        )

    monkeypatch.setattr(
        "app.services.ai_tasks.call_multimodal_document",
        fake_call,
    )
    monkeypatch.setattr(
        "app.services.llm_kimi.create_llm_provider",
        lambda: MockLlmProvider(),
    )
    _patch_audit_session(monkeypatch)

    asyncio.run(AiTaskExecutor._extract(session, task))

    persisted = session.add.call_args.args[0]
    assert isinstance(persisted, ContractInfo)
    assert persisted.contract_no == "HT-2026-001"
    assert persisted.party_a == "甲方A"
    assert persisted.raw_output["contract_no"] == "HT-2026-001"
    assert version.parse_status == "parsed"


def test_project_draft_without_text_falls_back_to_multimodal(monkeypatch, tmp_path):
    file_path = tmp_path / "contract.pdf"
    file_path.write_text("not a pdf")
    task = SimpleNamespace(
        id=2,
        payload={"files": [{"path": str(file_path), "name": "contract.pdf"}]},
    )
    session = AsyncMock()
    session.add = Mock()

    class RaisingExtractor:
        async def extract_text(self, path: str) -> str:
            raise MultimodalRequiredError("文本提取无效，需要多模态")

    async def fake_call(*args, **kwargs):
        return ProjectDraftOutput(
            name="项目 A",
            customer_name="客户 A",
            contract_amount=Decimal("1000000.00"),
            signed_date="2026-01-01",
            missing_fields=["started_date"],
        )

    monkeypatch.setattr(
        "app.services.ai_tasks.create_file_content_extractor",
        lambda _=None: RaisingExtractor(),
    )
    monkeypatch.setattr(
        "app.services.ai_tasks.call_multimodal_document",
        fake_call,
    )
    _patch_audit_session(monkeypatch)

    asyncio.run(AiTaskExecutor._project_draft(session, task))

    assert task.payload["result"]["name"] == "项目 A"
    assert task.payload["result"]["customer_name"] == "客户 A"
    assert task.payload["result"]["missing_fields"] == ["started_date"]


def test_project_draft_fills_amount_from_invoice_text(monkeypatch, tmp_path):
    file_path = tmp_path / "invoice.pdf"
    file_path.write_text("dummy")
    task = SimpleNamespace(
        id=3,
        payload={"files": [{"path": str(file_path), "name": "invoice.pdf"}]},
    )
    session = AsyncMock()
    session.add = Mock()

    class FakeExtractor:
        async def extract_text(self, path: str) -> str:
            return "价税合计：1,995.00\n"

    class FakeLlmClient:
        async def call(self, **kwargs):
            return ProjectDraftOutput(
                name="发票项目",
                customer_name="客户",
                contract_amount=None,
                signed_date=None,
                missing_fields=["signed_date"],
            )

    monkeypatch.setattr(
        "app.services.ai_tasks.create_file_content_extractor",
        lambda _=None: FakeExtractor(),
    )
    monkeypatch.setattr("app.services.ai_tasks.LoggedLlmClient", FakeLlmClient)
    _patch_audit_session(monkeypatch)

    asyncio.run(AiTaskExecutor._project_draft(session, task))

    assert task.payload["result"]["contract_amount"] == "1995.00"
