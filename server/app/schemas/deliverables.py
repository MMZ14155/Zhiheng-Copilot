from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.files import FileVersionResponse

DeliverableCategory = Literal["合同", "成本明细", "验收材料", "检测报告", "交付成果"]
TagType = Literal["demo", "report", "meeting", "audit", "custom"]


class TrackedFileCreate(BaseModel):
    source_file_id: int = Field(gt=0)
    category: DeliverableCategory
    required: bool = False


class CurrentVersionUpdate(BaseModel):
    version: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")


class TrackedFileResponse(BaseModel):
    id: int
    project_id: int
    source_file_id: int | None
    name: str
    category: DeliverableCategory
    required: bool
    current_version: str | None
    status: Literal["ok", "missing", "old", "conflict"]
    versions: list[FileVersionResponse]
    created_at: datetime
    updated_at: datetime


class TrackedFileListResponse(BaseModel):
    items: list[TrackedFileResponse]


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: TagType
    created_by: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=5000)


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    name: str
    type: TagType
    created_by: str
    note: str | None
    created_at: datetime


class TagListResponse(BaseModel):
    items: list[TagResponse]


class TagSnapshotCreate(BaseModel):
    source_file_id: int = Field(gt=0)
    version: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")
    note: str | None = Field(default=None, max_length=5000)


class TagSnapshotResponse(BaseModel):
    id: int
    tag_id: int
    source_file_id: int | None
    file_version: str
    name: str
    note: str | None
    created_at: datetime


class TagSnapshotListResponse(BaseModel):
    items: list[TagSnapshotResponse]
