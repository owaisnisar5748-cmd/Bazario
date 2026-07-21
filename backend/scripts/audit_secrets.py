from pathlib import Path
import os
import sys

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.config.security import ENV_PATH, validate_secret_key


def status(label, configured, detail):
    marker = "OK" if configured else "ACTION"
    print(f"[{marker}] {label}: {detail}")
    return configured


def main():
    values = dotenv_values(ENV_PATH)
    passed = True

    try:
        validate_secret_key(values.get("SECRET_KEY"))
        passed &= status("SECRET_KEY", True, "strong non-placeholder value configured")
    except RuntimeError as error:
        passed &= status("SECRET_KEY", False, str(error))

    database_url = (values.get("DATABASE_URL") or "").strip()
    passed &= status("DATABASE_URL", bool(database_url), "configured" if database_url else "missing")
    mail_ready = all(
        (values.get(key) or "").strip()
        for key in ("MAIL_USERNAME", "MAIL_PASSWORD", "MAIL_FROM", "MAIL_SERVER")
    )
    status("Password reset email", mail_ready, "configured" if mail_ready else "optional SMTP credentials missing")

    cloudinary_ready = all(
        (values.get(key) or "").strip()
        for key in ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET")
    )
    status("Cloudinary", cloudinary_ready, "configured" if cloudinary_ready else "image uploads unavailable")

    razorpay_values = [
        (values.get(key) or "").strip().lower()
        for key in ("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET")
    ]
    razorpay_ready = all(
        value and value not in {"your-key-id", "your-key-secret", "replace-me", "changeme"}
        for value in razorpay_values
    )
    if razorpay_ready:
        key_id = razorpay_values[0]
        razorpay_ready = (
            key_id.startswith(("rzp_test_", "rzp_live_"))
            and not key_id.startswith(("rzp_test__", "rzp_live__"))
        )
    status("Razorpay", razorpay_ready, "configured" if razorpay_ready else "online payments unavailable")

    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
