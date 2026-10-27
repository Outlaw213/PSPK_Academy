import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

Role = Literal["PARTICIPANT", "INSTRUCTOR", "ADMIN"]
Password = Field(min_length=10, max_length=200)
Name = Field(min_length=1, max_length=100)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    status: str
    roles: list[Role]
    created_at: datetime


class UserPage(BaseModel):
    items: list[UserOut]
    total: int
    limit: int
    offset: int


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Password
    first_name: str = Name
    last_name: str = Name
    roles: list[Role] = []

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class UserUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    roles: list[Role] | None = None
    status: Literal["ACTIVE", "DEACTIVATED"] | None = None


class PasswordSet(BaseModel):
    new_password: str = Password
