from pydantic import BaseModel, Field
class LoginRequest(BaseModel):
    login: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=1024)
class UserResponse(BaseModel):
    id: int; login: str; name: str; is_admin: bool
    model_config = {"from_attributes": True}
class LoginResponse(BaseModel):
    token: str; token_type: str = "bearer"; expires_at: str; user: UserResponse
