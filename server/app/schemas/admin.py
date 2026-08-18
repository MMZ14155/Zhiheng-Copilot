from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AdminUserCreate(BaseModel):
    login: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=120)
    password: str = Field(..., min_length=8, max_length=1024)
    is_admin: bool = False


class AdminUserResponse(BaseModel):
    id: int
    login: str
    name: str
    is_admin: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectMemberCreate(BaseModel):
    user_id: int = Field(..., gt=0)
    role: Literal["manager", "implementer"]


class ProjectMemberResponse(BaseModel):
    user_id: int
    login: str
    name: str
    role: Literal["manager", "implementer"]
    created_at: datetime


class LlmConfigUpdate(BaseModel):
    provider: str | None = Field(default=None, min_length=1, max_length=40)
    api_key: str | None = Field(default=None, max_length=4096)
    base_url: str | None = Field(default=None, min_length=1, max_length=2048)
    model: str | None = Field(default=None, min_length=1, max_length=200)
    timeout_seconds: int | None = Field(default=None, gt=0, le=600)
    input_price_per_mtok: Decimal | None = Field(default=None, ge=0)
    output_price_per_mtok: Decimal | None = Field(default=None, ge=0)


class LlmConfigResponse(BaseModel):
    provider: str
    base_url: str
    model: str
    timeout_seconds: int
    input_price_per_mtok: Decimal
    output_price_per_mtok: Decimal
    api_key_set: bool
    api_key_masked: str | None
    source: Literal["db", "env", "default"]


class LlmConfigTestResponse(BaseModel):
    ok: bool
    detail: str
