"""文件文本提取服务。

负责把上传的文件内容提取为纯文本，按 content_hash 命名落盘为 .md 文件，
并在提取无效时抛出 MultimodalRequiredError，提示需要多模态模型处理。
"""

import logging
import re
from pathlib import Path
from typing import Protocol

from app.core.config import Settings, get_settings
from app.core.extraction import MultimodalRequiredError
from app.services.settings_store import get_effective_llm_settings

logger = logging.getLogger(__name__)

MIN_MEANINGFUL_LENGTH = 50
EXTRACTS_SUBDIR = "extracts"


class FileContentExtractor(Protocol):
    async def extract_text(self, file_path: str) -> str | None: ...


class NullFileContentExtractor:
    """未配置有效 extractor 时的空实现，总是返回 None。"""

    async def extract_text(self, file_path: str) -> str | None:
        return None


from app.services.llm_kimi import KimiFileContentExtractor
def create_file_content_extractor(settings: Settings | None = None) -> FileContentExtractor:
    """根据当前 LLM 配置创建合适的文件内容提取器。"""
    effective = get_effective_llm_settings(settings or get_settings())
    if effective.provider.lower() == "kimi" and effective.api_key:
        return KimiFileContentExtractor(
            api_key=effective.api_key,
            base_url=effective.base_url,
            timeout_seconds=effective.timeout_seconds,
        )
    return NullFileContentExtractor()


def get_extracts_dir(settings: Settings | None = None) -> Path:
    """返回文本提取文件存放目录。"""
    return Path((settings or get_settings()).api_data_dir) / EXTRACTS_SUBDIR


def get_extract_path(content_hash: str, settings: Settings | None = None) -> Path:
    """根据文件内容哈希返回对应的 .md 提取文本路径。

    文件名与文件 content_hash 对应，确保同一内容只存一份提取文本。
    """
    if not content_hash or len(content_hash) != 64:
        raise ValueError("content_hash 必须是 64 位十六进制 SHA256 字符串")
    return get_extracts_dir(settings) / f"{content_hash}.md"


def _has_meaningful_content(text: str) -> bool:
    """判断文本中是否包含有效信息（而非纯空白或乱码）。"""
    # 至少包含若干汉字、字母数字或常见标点符号，避免把纯乱码/占位符当成有效内容
    meaningful_chars = len(re.findall(r"[\u4e00-\u9fa5a-zA-Z0-9]", text))
    return meaningful_chars >= 10


def is_meaningful_text(text: str | None) -> bool:
    """判断提取的文本是否包含足够有效信息。

    不满足条件时视为需要交给多模态模型处理。
    """
    if text is None:
        return False
    stripped = text.strip()
    if len(stripped) < MIN_MEANINGFUL_LENGTH:
        return False
    return _has_meaningful_content(stripped)


def save_extracted_text(content_hash: str, text: str, settings: Settings | None = None) -> Path:
    """把提取文本保存为 {content_hash}.md，返回落盘路径。"""
    path = get_extract_path(content_hash, settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    logger.info("saved extracted text content_hash=%s path=%s chars=%s", content_hash, path, len(text))
    return path


def load_extracted_text(extract_path: str | Path) -> str | None:
    """从 .md 文件中读取已保存的提取文本。"""
    path = Path(extract_path)
    if not path.exists():
        return None
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        logger.exception("failed to read extracted text path=%s", path)
        return None


async def extract_and_store_text(
    storage_path: str,
    content_hash: str,
    extractor: FileContentExtractor | None = None,
    settings: Settings | None = None,
) -> str:
    """提取文件文本并落盘，若提取无效则抛出 MultimodalRequiredError。

    返回保存后的 .md 文件绝对路径。
    """
    extractor = extractor or create_file_content_extractor(settings)
    logger.info(
        "extracting text storage_path=%s content_hash=%s extractor=%s",
        storage_path,
        content_hash,
        extractor.__class__.__name__,
    )
    text = await extractor.extract_text(storage_path)
    if not is_meaningful_text(text):
        logger.warning(
            "extracted text is empty or not meaningful content_hash=%s length=%s",
            content_hash,
            len(text) if text else 0,
        )
        raise MultimodalRequiredError(
            f"文件 {content_hash} 的文本提取结果无效，需要多模态模型处理"
        )
    path = save_extracted_text(content_hash, text, settings)
    return str(path)


async def get_or_extract_text(
    storage_path: str,
    content_hash: str,
    extract_path: str | None = None,
    extractor: FileContentExtractor | None = None,
    settings: Settings | None = None,
) -> str:
    """优先读取已保存的提取文本，没有则重新提取。

    若提取无效则抛出 MultimodalRequiredError。
    """
    if extract_path:
        cached = load_extracted_text(extract_path)
        if cached is not None and is_meaningful_text(cached):
            logger.debug("using cached extracted text content_hash=%s", content_hash)
            return cached
    return await extract_and_store_text(storage_path, content_hash, extractor, settings)
