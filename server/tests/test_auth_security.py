from fastapi.testclient import TestClient
from app.core.security import hash_password, hash_token, verify_password
from app.main import app
def test_password_hash():
    first=hash_password("secret"); second=hash_password("secret")
    assert first != second and "secret" not in first and verify_password("secret", first) and not verify_password("wrong", first)
def test_token_hash(): assert len(hash_token("opaque")) == 64 and "opaque" not in hash_token("opaque")
def test_unauthorized_shape():
    response=TestClient(app).get("/api/v1/projects")
    assert response.status_code == 401 and response.json() == {"detail":"请先登录","code":"UNAUTHORIZED"}
