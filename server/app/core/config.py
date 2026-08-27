from decimal import Decimal
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="Zhiheng Copilot API", validation_alias="APP_NAME")
    database_url: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:8088/zhiheng_copilot",
        validation_alias="DATABASE_URL",
    )
    cors_origins_raw: str = Field(
        default="http://localhost:5173",
        validation_alias="CORS_ORIGINS",
    )
    api_data_dir: str = Field(default="/data", validation_alias="API_DATA_DIR")
    max_upload_file_size_bytes: int = Field(
        default=100 * 1024 * 1024,
        gt=0,
        validation_alias="MAX_UPLOAD_FILE_SIZE_BYTES",
    )
    auth_disabled: bool = Field(default=False, validation_alias="AUTH_DISABLED")
    auth_token_ttl_hours: int = Field(default=24, validation_alias="AUTH_TOKEN_TTL_HOURS")
    llm_provider: str = Field(default="mock", validation_alias="LLM_PROVIDER")
    kimi_api_key: str = Field(default="", validation_alias="KIMI_API_KEY")
    kimi_base_url: str = Field(
        default="https://api.moonshot.cn/v1", validation_alias="KIMI_BASE_URL"
    )
    kimi_model: str = Field(default="kimi-k2.6", validation_alias="KIMI_MODEL")
    kimi_timeout_seconds: int = Field(default=120, validation_alias="KIMI_TIMEOUT_SECONDS")
    kimi_input_price_per_mtok: Decimal = Field(
        default=Decimal("0"), validation_alias="KIMI_INPUT_PRICE_PER_MTOK"
    )
    kimi_output_price_per_mtok: Decimal = Field(
        default=Decimal("0"), validation_alias="KIMI_OUTPUT_PRICE_PER_MTOK"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins_raw.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
