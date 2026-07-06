from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
import secrets

from app.config.security import validate_secret_key
from app.db.database import database

OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "10"))
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
OTP_RESEND_SECONDS = int(os.getenv("OTP_RESEND_SECONDS", "30"))
OTP_VERIFICATION_MINUTES = int(os.getenv("OTP_VERIFICATION_MINUTES", "15"))
OTP_SECRET = validate_secret_key()


def _normalize(value: str) -> str:
    return value.strip().lower()


def _record_id(identity: str, purpose: str) -> str:
    return f"{purpose}:{_normalize(identity)}"


def _as_utc(value: datetime | None):
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _hash_otp(record_id: str, otp: str) -> str:
    return hmac.new(
        OTP_SECRET.encode("utf-8"),
        f"{record_id}:{otp}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


async def create_otp(
    identity: str,
    purpose: str = "registration",
    channel: str = "email",
    destination: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    record_id = _record_id(identity, purpose)
    existing = await database.otp_codes.find_one({"_id": record_id}, {"resend_at": 1})

    resend_at = _as_utc(existing.get("resend_at")) if existing else None
    if resend_at and resend_at > now:
        raise ValueError("Please wait before requesting another OTP")

    otp = f"{secrets.randbelow(900000) + 100000}"
    await database.otp_codes.replace_one(
        {"_id": record_id},
        {
            "_id": record_id,
            "otp_hash": _hash_otp(record_id, otp),
            "identity": _normalize(identity),
            "purpose": purpose,
            "channel": channel,
            "destination": destination or identity,
            "expires_at": now + timedelta(minutes=OTP_EXPIRY_MINUTES),
            "resend_at": now + timedelta(seconds=OTP_RESEND_SECONDS),
            "attempts": 0,
        },
        upsert=True,
    )
    await database.otp_verifications.delete_one({"_id": record_id})
    return otp


async def invalidate_otp(identity: str, purpose: str = "registration"):
    await database.otp_codes.delete_one({"_id": _record_id(identity, purpose)})


async def verify_otp_code(
    identity: str,
    otp: str,
    purpose: str = "registration",
    channel: str | None = None,
    destination: str | None = None,
) -> bool:
    now = datetime.now(timezone.utc)
    record_id = _record_id(identity, purpose)
    record = await database.otp_codes.find_one({"_id": record_id})

    expires_at = _as_utc(record.get("expires_at")) if record else None
    if not record or not expires_at or expires_at < now:
        await database.otp_codes.delete_one({"_id": record_id})
        return False
    if channel and record.get("channel") != channel:
        return False
    if destination and _normalize(str(record.get("destination", ""))) != _normalize(destination):
        return False

    attempts = int(record.get("attempts", 0)) + 1
    if attempts > OTP_MAX_ATTEMPTS:
        await database.otp_codes.delete_one({"_id": record_id})
        return False

    if not secrets.compare_digest(record.get("otp_hash", ""), _hash_otp(record_id, otp)):
        await database.otp_codes.update_one({"_id": record_id}, {"$set": {"attempts": attempts}})
        return False

    await database.otp_codes.delete_one({"_id": record_id})
    await database.otp_verifications.replace_one(
        {"_id": record_id},
        {
            "_id": record_id,
            "identity": record["identity"],
            "purpose": purpose,
            "channel": record.get("channel", "email"),
            "destination": record.get("destination", identity),
            "expires_at": now + timedelta(minutes=OTP_VERIFICATION_MINUTES),
        },
        upsert=True,
    )
    return True


async def consume_verification(identity: str, purpose: str = "registration"):
    record_id = _record_id(identity, purpose)
    record = await database.otp_verifications.find_one_and_delete({"_id": record_id})

    expires_at = _as_utc(record.get("expires_at")) if record else None
    if not record or not expires_at or expires_at < datetime.now(timezone.utc):
        return None
    return record
