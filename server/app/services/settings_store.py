import os
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.system_setting import SystemSetting

LLM_SETTING_FIELDS = {
    "provider": "llm_provider",
    "api_key": "kimi_api_key",
    "base_url": "kimi_base_url",
    "model": "kimi_model",
    "timeout_seconds": "kimi_timeout_seconds",
    "input_price_per_mtok": "kimi_input_price_per_mtok",
    "output_price_per_mtok": "kimi_output_price_per_mtok",
}
DB_KEYS = {name: f"llm.{name}" for name in LLM_SETTING_FIELDS}
ENV_KEYS = {
    "provider": "LLM_PROVIDER",
    "api_key": "KIMI_API_KEY",
    "base_url": "KIMI_BASE_URL",
    "model": "KIMI_MODEL",
    "timeout_seconds": "KIMI_TIMEOUT_SECONDS",
    "input_price_per_mtok": "KIMI_INPUT_PRICE_PER_MTOK",
    "output_price_per_mtok": "KIMI_OUTPUT_PRICE_PER_MTOK",
}

# 运行时覆盖缓存仅面向单进程 uvicorn；多进程部署需要外部缓存或进程间通知。
_overrides: dict[str, str] = {}


@dataclass(frozen=True)
class EffectiveLlmSettings:
    provider: str
    api_key: str
    base_url: str
    model: str
    timeout_seconds: int
    input_price_per_mtok: Decimal
    output_price_per_mtok: Decimal
    source: str


def replace_overrides(values: dict[str, str]) -> None:
    global _overrides
    _overrides = {name: value for name, value in values.items() if name in LLM_SETTING_FIELDS}


def get_overrides() -> dict[str, str]:
    return dict(_overrides)


async def load_llm_overrides(session: AsyncSession) -> None:
    rows = (
        await session.scalars(select(SystemSetting).where(SystemSetting.key.in_(DB_KEYS.values())))
    ).all()
    by_key = {row.key: row.value for row in rows}
    replace_overrides({name: by_key[key] for name, key in DB_KEYS.items() if key in by_key})


def get_effective_llm_settings(settings: Settings | None = None) -> EffectiveLlmSettings:
    settings = settings or get_settings()

    def value(name: str):
        if name in _overrides:
            return _overrides[name]
        return getattr(settings, LLM_SETTING_FIELDS[name])

    source = "db" if _overrides else (
        "env" if any(key in os.environ for key in ENV_KEYS.values()) else "default"
    )
    return EffectiveLlmSettings(
        provider=str(value("provider")),
        api_key=str(value("api_key")),
        base_url=str(value("base_url")),
        model=str(value("model")),
        timeout_seconds=int(value("timeout_seconds")),
        input_price_per_mtok=Decimal(str(value("input_price_per_mtok"))),
        output_price_per_mtok=Decimal(str(value("output_price_per_mtok"))),
        source=source,
    )
