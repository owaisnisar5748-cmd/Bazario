import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BACKEND_DIR / ".env"

PLACEHOLDER_SECRETS = {
    "change-me",
    "replace-me",
    "replace-with-a-long-random-secret",
    "secret",
    "your-secret-key",
    "your-secret-key-change-this",
}


def load_backend_env():
    load_dotenv(ENV_PATH)


def validate_secret_key(secret_key: str | None = None) -> str:
    value = (secret_key if secret_key is not None else os.getenv("SECRET_KEY", "")).strip()

    if not value:
        raise RuntimeError("SECRET_KEY must be configured in backend/.env")
    normalized = value.lower()
    if normalized in PLACEHOLDER_SECRETS or normalized.startswith(("replace-", "your-")):
        raise RuntimeError(
            "SECRET_KEY is still a placeholder. Run backend/scripts/rotate_secret_key.py"
        )
    if len(value) < 32:
        raise RuntimeError("SECRET_KEY must contain at least 32 characters")
    return value


def validate_security_config():
    validate_secret_key()
