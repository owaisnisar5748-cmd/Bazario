import argparse
from pathlib import Path
import sys

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.config.security import validate_secret_key


PLACEHOLDERS = {
    "",
    "replace-me",
    "your-key-id",
    "your-key-secret",
    "your-api-key",
    "your-api-secret",
    "your-cloud-name",
}


def configured(values, *keys):
    normalized_values = [
        str(values.get(key) or "").strip().lower()
        for key in keys
    ]
    return all(
        value not in PLACEHOLDERS and not value.startswith(("replace-", "your-"))
        for value in normalized_values
    )


def main():
    parser = argparse.ArgumentParser(description="Validate Bazario production configuration.")
    parser.add_argument(
        "--env",
        default=str(BACKEND_DIR.parent / ".env.production"),
        help="Path to the production environment file.",
    )
    args = parser.parse_args()
    env_path = Path(args.env).resolve()
    if not env_path.exists():
        raise SystemExit(f"[FAIL] Missing environment file: {env_path}")

    values = dotenv_values(env_path)
    failures = []

    try:
        validate_secret_key(values.get("SECRET_KEY"))
    except RuntimeError as error:
        failures.append(str(error))

    if str(values.get("APP_ENV") or "").strip().lower() != "production":
        failures.append("APP_ENV must be production")
    if not configured(values, "DATABASE_URL"):
        failures.append("DATABASE_URL is required. Use sqlite:////data/bazario.db or mysql://user:password@host:3306/database")

    origins = [
        item.strip()
        for item in str(values.get("ALLOWED_ORIGINS") or "").split(",")
        if item.strip()
    ]
    if not origins or any(origin == "*" or origin.startswith("http://") for origin in origins):
        failures.append("ALLOWED_ORIGINS must contain explicit HTTPS production origins")
    hosts = [
        item.strip()
        for item in str(values.get("ALLOWED_HOSTS") or "").split(",")
        if item.strip()
    ]
    if not hosts or "*" in hosts or any("://" in host for host in hosts):
        failures.append("ALLOWED_HOSTS must contain explicit hostnames without URL schemes")

    email_ready = configured(
        values,
        "MAIL_USERNAME",
        "MAIL_PASSWORD",
        "MAIL_FROM",
        "MAIL_SERVER",
    )
    sms_ready = configured(
        values,
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_FROM_NUMBER",
    )
    if not email_ready and not sms_ready:
        failures.append("Configure SMTP or Twilio for OTP delivery")
    if not configured(
        values,
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
    ):
        failures.append("Cloudinary credentials are required for seller image uploads")

    razorpay_key = str(values.get("RAZORPAY_KEY_ID") or "").strip()
    if not configured(values, "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET") or not razorpay_key.startswith(
        ("rzp_test_", "rzp_live_")
    ):
        failures.append("Valid Razorpay credentials are required for online payments")
    if str(values.get("OTP_ALLOW_DEV_CODE") or "").strip().lower() == "true":
        failures.append("OTP_ALLOW_DEV_CODE must be false in production")

    if failures:
        for failure in failures:
            print(f"[FAIL] {failure}")
        raise SystemExit(1)

    print("[OK] Bazario production configuration is ready.")


if __name__ == "__main__":
    main()
