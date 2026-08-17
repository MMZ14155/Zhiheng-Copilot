import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.api import admin as admin_api
from app.api.dependencies import require_admin
from app.core.security import verify_password
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.user import User
from app.schemas.admin import AdminUserCreate, ProjectMemberCreate
from tests.conftest import Result


def test_require_admin(users):
    assert asyncio.run(require_admin(users.admin)) is users.admin
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(require_admin(users.member))
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "FORBIDDEN"


def test_admin_payload_validation():
    with pytest.raises(ValidationError):
        AdminUserCreate(login="new", name="新人", password="short", is_admin=False)
    with pytest.raises(ValidationError):
        ProjectMemberCreate(user_id=2, role="owner")


def test_create_user_hashes_password(fake_session, now):
    async def refresh(user):
        user.id = 3
        user.created_at = now

    fake_session.refresh.side_effect = refresh
    payload = AdminUserCreate(login="new", name="新人", password="password8", is_admin=False)
    response = asyncio.run(admin_api.create_user(payload, fake_session))
    stored = fake_session.added[0]
    assert response.login == "new"
    assert verify_password("password8", stored.password_hash)
    assert "password_hash" not in response.model_dump()


def test_create_user_rejects_duplicate(fake_session):
    fake_session.commit.side_effect = IntegrityError("insert", {}, Exception("duplicate"))
    payload = AdminUserCreate(login="same", name="重名", password="password8")
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(admin_api.create_user(payload, fake_session))
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "USER_LOGIN_EXISTS"
    fake_session.rollback.assert_awaited_once()


def test_delete_user_guards_and_cleanup(fake_session, users):
    fake_session.get.return_value = users.admin
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(admin_api.delete_user(users.admin.id, fake_session, users.admin))
    assert exc_info.value.detail["code"] == "CANNOT_DELETE_SELF"

    target = User(id=3, login="target", name="待删除", is_admin=False, password_hash="x")
    fake_session.get.return_value = target
    response = asyncio.run(admin_api.delete_user(target.id, fake_session, users.admin))
    assert response.status_code == 204
    fake_session.execute.assert_awaited_once()
    fake_session.delete.assert_awaited_once_with(target)
    fake_session.commit.assert_awaited_once()


def test_delete_last_admin(fake_session):
    current = User(id=0, login="system", name="系统", is_admin=True, password_hash="x")
    target = User(id=1, login="only", name="唯一管理员", is_admin=True, password_hash="x")
    fake_session.get.return_value = target
    fake_session.scalar.return_value = 1
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(admin_api.delete_user(target.id, fake_session, current))
    assert exc_info.value.detail["code"] == "CANNOT_DELETE_LAST_ADMIN"


def test_project_member_lifecycle(fake_session, users, now):
    project = Project(id=5, name="项目", code="P5", customer_name="客户")
    fake_session.get.side_effect = [project, users.member]

    async def refresh(member):
        member.id = 8
        member.created_at = now

    fake_session.refresh.side_effect = refresh
    payload = ProjectMemberCreate(user_id=users.member.id, role="manager")
    response = asyncio.run(admin_api.create_project_member(project.id, payload, fake_session))
    assert response.user_id == users.member.id and response.role == "manager"

    member = ProjectMember(id=8, project_id=project.id, user_id=users.member.id, role="manager", created_at=now)
    fake_session.scalar.return_value = member
    deleted = asyncio.run(admin_api.delete_project_member(project.id, users.member.id, fake_session))
    assert deleted.status_code == 204


def test_duplicate_project_member(fake_session, users):
    fake_session.get.side_effect = [SimpleNamespace(id=5), users.member]
    fake_session.commit.side_effect = IntegrityError("insert", {}, Exception("duplicate"))
    payload = ProjectMemberCreate(user_id=users.member.id, role="implementer")
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(admin_api.create_project_member(5, payload, fake_session))
    assert exc_info.value.detail["code"] == "PROJECT_MEMBER_EXISTS"


def test_list_project_members(fake_session, users, now):
    fake_session.get.return_value = SimpleNamespace(id=5)
    member = ProjectMember(id=1, project_id=5, user_id=users.member.id, role="implementer", created_at=now)
    fake_session.execute.return_value = Result([(member, users.member)])
    response = asyncio.run(admin_api.list_project_members(5, fake_session))
    assert response[0].login == users.member.login
    assert response[0].role == "implementer"
