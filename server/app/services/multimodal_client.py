"""多模态文档处理客户端。

负责在文本提取无效时，将文档（PDF/图片）转成图片并通过 Kimi 多模态
chat.completions API 直接获取结构化输出。
"""

import base64
import json
import logging
import os
import re
import tempfile
from pathlib import Path
from typing import TypeVar

import httpx
import pymupdf
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.services.settings_store import get_effective_llm_settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}


def _image_to_base64(path: Path) -> str:
    with path.open("rb") as f:
        return base64.b64encode(f.read()).decode()


def _pdf_to_images(path: str, dpi: int = 150) -> list[Path]:
    """将 PDF 每页转成临时 PNG 图片，返回临时文件路径列表。"""
    doc = pymupdf.open(path)
    temp_paths: list[Path] = []
    for page_number in range(len(doc)):
        page = doc[page_number]
        # matrix 控制缩放；dpi 150 足够识别文字且体积可控
        pix = page.get_pixmap(matrix=pymupdf.Matrix(dpi / 72, dpi / 72))
        temp_path = Path(tempfile.mktemp(suffix=f"_page_{page_number + 1}.png"))
        pix.save(str(temp_path))
        temp_paths.append(temp_path)
    doc.close()
    return temp_paths


def _convert_to_images(file_path: str) -> list[Path]:
    path = Path(file_path)
    ext = path.suffix.lower()
    if ext == ".pdf":
        return _pdf_to_images(file_path)
    if ext in SUPPORTED_IMAGE_EXTENSIONS:
        return [path]
    raise ValueError(f"不支持的文件类型 {ext}，无法转换为图片进行多模态处理")


def _build_image_messages(image_paths: list[Path]) -> list[dict]:
    messages = []
    for img_path in image_paths:
        base64_data = _image_to_base64(img_path)
        ext = img_path.suffix.lower().lstrip(".")
        if ext == "jpg":
            ext = "jpeg"
        messages.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/{ext};base64,{base64_data}"},
        })
    return messages


def _snake_case(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


async def call_multimodal_document(
    file_path: str,
    output_schema: type[T],
    instruction: str,
    settings: Settings | None = None,
) -> T:
    """将文档转为图片，调用 Kimi 多模态 API 返回结构化输出。

    Args:
        file_path: 本地文件路径（PDF 或图片）。
        output_schema: 期望输出的 Pydantic 模型类。
        instruction: 给模型的自然语言指令。
        settings: 可选配置，用于读取 Kimi API 密钥等。

    Returns:
        output_schema 的实例。

    Raises:
        RuntimeError: 多模态调用失败或返回无法解析。
    """
    effective = get_effective_llm_settings(settings or get_settings())
    if effective.provider.lower() != "kimi" or not effective.api_key:
        raise RuntimeError("多模态处理需要配置 Kimi API 密钥")

    temp_images: list[Path] = []
    try:
        temp_images = _convert_to_images(file_path)
        image_messages = _build_image_messages(temp_images)
        payload = {
            "model": effective.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是一位严谨的文档理解助手。用户会上传文档图片，"
                        "请严格依据图片内容回答问题。输出必须是可被 json.loads 直接解析的纯 JSON 对象，"
                        "不要 Markdown 代码块，不要任何解释。"
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": instruction},
                        *image_messages,
                    ],
                },
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": _snake_case(output_schema.__name__),
                    "strict": True,
                    "schema": output_schema.model_json_schema(),
                },
            },
        }

        async with httpx.AsyncClient(
            base_url=effective.base_url.rstrip("/"),
            timeout=effective.timeout_seconds,
            headers={"Authorization": f"Bearer {effective.api_key}"},
        ) as client:
            response = await client.post("/chat/completions", json=payload)
            if response.status_code < 200 or response.status_code >= 300:
                raise RuntimeError(f"Kimi 多模态请求失败 HTTP {response.status_code}")
            body = response.json()
            content = body["choices"][0]["message"]["content"]
            if not content:
                raise RuntimeError("Kimi 多模态返回空内容")
            stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
            data = json.loads(stripped)
            if not isinstance(data, dict):
                raise RuntimeError("Kimi 多模态返回非法 JSON")
            return output_schema.model_validate(data)
    finally:
        # 仅清理由本函数生成的临时图片，不清理用户原始文件
        for temp_path in temp_images:
            try:
                if temp_path.exists():
                    os.unlink(temp_path)
            except OSError as exc:
                logger.warning("cleanup temp image failed path=%s error=%s", temp_path, exc)
