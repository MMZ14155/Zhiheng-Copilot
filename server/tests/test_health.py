from fastapi.testclient import TestClient

from app.db.session import get_session
from app.main import app


def test_health_uses_overridden_session(fake_session):
    async def override():
        yield fake_session

    app.dependency_overrides[get_session] = override
    try:
        response = TestClient(app).get("/api/v1/health")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    fake_session.execute.assert_awaited_once()