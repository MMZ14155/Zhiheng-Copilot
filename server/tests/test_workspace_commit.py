import asyncio
from unittest.mock import AsyncMock

import pytest

from app.api import files
from app.models.project import Project
from app.schemas.workspace_commit import WorkspaceAddOperation, WorkspaceCommitRequest, WorkspaceRemoveOperation, WorkspaceUpdateOperation


def test_workspace_commit_endpoint(fake_session, users, now, monkeypatch):
    monkeypatch.setattr(files, "require_project_role", AsyncMock())
    fake_session.get.return_value = Project(id=1)
    monkeypatch.setattr(files.WorkspaceCommitService, "commit", AsyncMock(return_value="s" * 64))

    payload = WorkspaceCommitRequest(
        message="工作区提交",
        operations=[
            WorkspaceAddOperation(name="a.pdf", content="aGVsbG8=", doc_type="contract"),
            WorkspaceUpdateOperation(file_id=2, content="d29ybGQ="),
            WorkspaceRemoveOperation(file_id=3),
        ],
    )
    response = asyncio.run(files.workspace_commit(1, payload, fake_session, users.member))
    assert response.snapshot == "s" * 64
    assert response.message == "工作区提交成功"
    files.WorkspaceCommitService.commit.assert_awaited_once()


def test_workspace_commit_project_not_found(fake_session, users, monkeypatch):
    monkeypatch.setattr(files, "require_project_role", AsyncMock())
    fake_session.get.return_value = None
    payload = WorkspaceCommitRequest(message="提交", operations=[WorkspaceRemoveOperation(file_id=1)])
    with pytest.raises(Exception):
        asyncio.run(files.workspace_commit(1, payload, fake_session, users.member))
