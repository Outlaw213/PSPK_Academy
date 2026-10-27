from pydantic import BaseModel, EmailStr, field_validator

from app.schemas.user import Name, Password


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Password
    first_name: str = Name
    last_name: str = Name

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class LoginIn(BaseModel):
    email: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str | None = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Password


class TokensOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None
