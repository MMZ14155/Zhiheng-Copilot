from datetime import datetime
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
