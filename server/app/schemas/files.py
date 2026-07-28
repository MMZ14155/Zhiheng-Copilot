from typing import Optional

from pydantic import BaseModel, Field


class FileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    doc_type: Optional[str] = Field(None)


class FileVersionCreate(BaseModel):
    uploaded_by: str = Field(..., min_length=1, max_length=120)
    changelog: str = Field(default="", max_length=5000)


class CreateFileResponse(BaseModel):
    file_id: int
    version: str
    message: str


class FileVersionResponse(BaseModel):
    version: str
    file_id: int
    prev_version: Optional[str]
    storage_path: str
    content_hash: str
    size_bytes: int
    uploaded_by: str
    changelog: str
    document_type: Optional[str]
    parse_status: str
    is_frozen: bool
    uploaded_at: str


class VersionListResponse(BaseModel):
    file_id: int
    versions: list[FileVersionResponse]
