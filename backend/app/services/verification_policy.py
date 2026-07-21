import os

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
OTP_ALLOW_DEV_CODE = os.getenv(
    "OTP_ALLOW_DEV_CODE",
    "true" if APP_ENV != "production" else "false",
).strip().lower() == "true" and APP_ENV != "production"
REGISTRATION_REQUIRE_VERIFICATION = os.getenv(
    "REGISTRATION_REQUIRE_VERIFICATION",
    "auto",
).strip().lower()


def registration_requires_verification() -> bool:
    return False
