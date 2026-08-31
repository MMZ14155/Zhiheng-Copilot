from pydantic import BaseModel, Field


class WorkspaceAddOperation(BaseModel):
    op: str = Field(default="add")
    name: str
    content: str
    doc_type: str | None = None
    changelog: str | None = None


class WorkspaceUpdateOperation(BaseModel):
    op: str = Field(default="update")
    file_id: int
    content: str
    changelog: str | None = None


class WorkspaceRemoveOperation(BaseModel):
    op: str = Field(default="remove")
    file_id: int


class WorkspaceCommitRequest(BaseModel):
    message: str | None = Field(default=None, max_length=200)
    operations: list[WorkspaceAddOperation | WorkspaceUpdateOperation | WorkspaceRemoveOperation]


class WorkspaceCommitResponse(BaseModel):
    snapshot: str
    message: str
