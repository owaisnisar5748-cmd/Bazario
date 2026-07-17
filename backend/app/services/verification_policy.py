import os

from app.services.otp_delivery import email_is_configured, sms_is_configured


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
    if REGISTRATION_REQUIRE_VERIFICATION in {"true", "1", "yes", "on"}:
        return True
    if REGISTRATION_REQUIRE_VERIFICATION in {"false", "0", "no", "off"}:
        return False
    if APP_ENV == "production":
        return True

    return email_is_configured() or sms_is_configured() or OTP_ALLOW_DEV_CODE
