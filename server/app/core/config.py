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
    auth_disabled: bool = Field(default=False, validation_alias="AUTH_DISABLED")
    auth_token_ttl_hours: int = Field(default=24, validation_alias="AUTH_TOKEN_TTL_HOURS")

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
