from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_SECRETS = {"", "CHANGE_ME", "changeme", "secret"}


class Settings(BaseSettings):
    """All configuration comes from the environment (NFR-03); see .env.example."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+asyncpg://pspk:pspk@localhost:5432/pspk_academy"
    database_connect_timeout_s: float = 3.0

    jwt_secret_key: str = "CHANGE_ME"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 30

    # Photos live on the server's own disk (ADR-24) and are resized on upload (ADR-25).
    storage_root: str = "/data/storage"
    max_upload_size_mb: int = 10
    max_submission_photos: int = 10
    max_attachment_size_mb: int = 20
    image_max_edge: int = 2560
    image_quality: int = 82

    @model_validator(mode="after")
    def _no_placeholder_secret_in_production(self) -> "Settings":
        if self.environment == "production" and self.jwt_secret_key in PLACEHOLDER_SECRETS:
            raise ValueError("JWT_SECRET_KEY must be set to a real secret in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
