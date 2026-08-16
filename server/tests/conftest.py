from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.user import User


class ScalarRows:
    def __init__(self, values=()):
        self.values = list(values)

    def all(self):
        return self.values

    def __iter__(self):
        return iter(self.values)


class Result:
    def __init__(self, values=(), *, one=None):
        self.values = list(values)
        self._one = one

    def scalars(self):
        return ScalarRows(self.values)

    def all(self):
        return self.values

    def scalar_one_or_none(self):
        return self.values[0] if self.values else None

    def first(self):
        return self.values[0] if self.values else None

    def one(self):
        return self._one if self._one is not None else self.values[0]

    def __iter__(self):
        return iter(self.values)


@pytest.fixture
def fake_session():
    session = SimpleNamespace(
        get=AsyncMock(), scalar=AsyncMock(), scalars=AsyncMock(), execute=AsyncMock(),
        flush=AsyncMock(), commit=AsyncMock(), rollback=AsyncMock(), refresh=AsyncMock(),
        delete=AsyncMock(), added=[]
    )
    session.add = lambda value: session.added.append(value)
    return session


@pytest.fixture
def users():
    return SimpleNamespace(
        admin=User(id=1, login="admin", name="管理员", is_admin=True, password_hash="x"),
        member=User(id=2, login="member", name="成员", is_admin=False, password_hash="x"),
    )


@pytest.fixture
def now():
    return datetime(2026, 1, 1, tzinfo=timezone.utc)