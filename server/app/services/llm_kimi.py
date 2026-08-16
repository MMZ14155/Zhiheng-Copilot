import json
import logging
import re
from decimal import Decimal
from pathlib import Path

import httpx
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.services.llm import LlmProvider, MockLlmProvider, ProviderResult

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024
SUPPORTED_FILE_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".md",
    ".csv",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".svg",
}


class KimiProviderError(Exception):
    """Kimi 调用失败，message 不含 API Key 与文件内容。"""


def _snake_case(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


class KimiLlmProvider:
    name = "kimi"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_seconds: int,
        input_price_per_mtok: Decimal,
        output_price_per_mtok: Decimal,
        client: httpx.AsyncClient | None = None,
    ):
        self.model_name = model
        self._input_price = input_price_per_mtok
        self._output_price = output_price_per_mtok
        self._client = client or httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    async def generate(self, prompt: str, output_schema: type[BaseModel]) -> ProviderResult:
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": _snake_case(output_schema.__name__),
                    "strict": True,
                    "schema": output_schema.model_json_schema(),
                },
            },
        }
        try:
            response = await self._client.post("/chat/completions", json=payload)
        except httpx.TimeoutException as exc:
            raise KimiProviderError("Kimi API 请求超时") from exc
        except httpx.RequestError as exc:
            raise KimiProviderError("Kimi API 网络请求失败") from exc
        if response.status_code < 200 or response.status_code >= 300:
            raise KimiProviderError(f"Kimi API 请求失败 HTTP {response.status_code}")
        try:
            body = response.json()
        except json.JSONDecodeError as exc:
            raise KimiProviderError("Kimi API 返回非法 JSON") from exc
        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise KimiProviderError("Kimi API 响应结构异常") from exc
        if not content:
            raise KimiProviderError("Kimi API 返回空内容")
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            raise KimiProviderError("Kimi API 返回非法 JSON") from exc
        if not isinstance(data, dict):
            raise KimiProviderError("Kimi API 返回非法 JSON")
        usage = body.get("usage") or {}
        input_tokens = int(usage.get("prompt_tokens") or 0)
        output_tokens = int(usage.get("completion_tokens") or 0)
        cost = (
            Decimal(input_tokens) * self._input_price
            + Decimal(output_tokens) * self._output_price
        ) / Decimal(1_000_000)
        return ProviderResult(
            data,
            input_tokens,
            output_tokens,
            cost.quantize(Decimal("0.000001")),
        )


class KimiFileContentExtractor:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout_seconds: int,
        client: httpx.AsyncClient | None = None,
    ):
        self._client = client or httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    async def extract_text(self, file_path: str) -> str:
        path = Path(file_path)
        if not path.is_file():
            raise KimiProviderError("待解析文件不存在")
        if path.stat().st_size > MAX_FILE_SIZE_BYTES:
            raise KimiProviderError("待解析文件超过 100MB 限制")
        if path.suffix.lower() not in SUPPORTED_FILE_EXTENSIONS:
            raise KimiProviderError(f"不支持解析的文件类型 {path.suffix.lower() or '未知'}")
        file_id = await self._upload(path)
        try:
            return await self._fetch_content(file_id)
        finally:
            await self._delete(file_id)

    async def _upload(self, path: Path) -> str:
        try:
            with path.open("rb") as file_obj:
                response = await self._client.post(
                    "/files",
                    data={"purpose": "file-extract"},
                    files={"file": (path.name, file_obj)},
                )
        except httpx.TimeoutException as exc:
            raise KimiProviderError("Kimi 文件上传超时") from exc
        except httpx.RequestError as exc:
            raise KimiProviderError("Kimi 文件上传网络请求失败") from exc
        if response.status_code < 200 or response.status_code >= 300:
            raise KimiProviderError(f"Kimi 文件上传失败 HTTP {response.status_code}")
        try:
            file_id = response.json()["id"]
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            raise KimiProviderError("Kimi 文件上传响应结构异常") from exc
        logger.info("uploaded file to Kimi file_id=%s name=%s", file_id, path.name)
        return file_id

    async def _fetch_content(self, file_id: str) -> str:
        try:
            response = await self._client.get(f"/files/{file_id}/content")
        except httpx.TimeoutException as exc:
            raise KimiProviderError("Kimi 文件内容获取超时") from exc
        except httpx.RequestError as exc:
            raise KimiProviderError("Kimi 文件内容获取网络请求失败") from exc
        if response.status_code < 200 or response.status_code >= 300:
            raise KimiProviderError(f"Kimi 文件内容获取失败 HTTP {response.status_code}")
        try:
            body = response.json()
        except json.JSONDecodeError:
            body = None
        if isinstance(body, dict) and isinstance(body.get("content"), str):
            text = body["content"]
        else:
            text = response.text
        if not text:
            raise KimiProviderError("Kimi 文件解析内容为空")
        return text

    async def _delete(self, file_id: str) -> None:
        try:
            response = await self._client.delete(f"/files/{file_id}")
            if response.status_code < 200 or response.status_code >= 300:
                logger.warning(
                    "failed to delete Kimi file file_id=%s HTTP %s",
                    file_id,
                    response.status_code,
                )
        except httpx.HTTPError:
            logger.warning("failed to delete Kimi file file_id=%s", file_id)


def create_llm_provider(settings: Settings | None = None) -> LlmProvider:
    settings = settings or get_settings()
    if settings.llm_provider.lower() == "kimi" and settings.kimi_api_key:
        return KimiLlmProvider(
            api_key=settings.kimi_api_key,
            base_url=settings.kimi_base_url,
            model=settings.kimi_model,
            timeout_seconds=settings.kimi_timeout_seconds,
            input_price_per_mtok=settings.kimi_input_price_per_mtok,
            output_price_per_mtok=settings.kimi_output_price_per_mtok,
        )
    return MockLlmProvider()
