from datetime import datetime
from pydantic import BaseModel, Field

class SnapshotSummary(BaseModel):
    hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    parent_hash: str | None
    author: str
    message: str
    created_at: datetime
    entry_count: int

class SnapshotTimelineResponse(BaseModel):
    project_id: int
    snapshots: list[SnapshotSummary]

class SnapshotEntryResponse(BaseModel):
    file_id: int
    path: str
    version: str
    uploader: str
    uploaded_at: datetime

class SnapshotDetailResponse(SnapshotSummary):
    project_id: int
    entries: list[SnapshotEntryResponse]

class SkippedFile(BaseModel):
    file_id: int
    path: str
    reason: str

class SnapshotRestoreResponse(BaseModel):
    snapshot: str
    restored_files: int
    skipped: list[SkippedFile]
