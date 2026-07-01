import os
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.services.otp_delivery import (
    OTPDeliveryError,
    email_is_configured,
    normalize_phone,
    send_email_otp,
    send_sms_otp,
    sms_is_configured,
)
from app.services.otp_service import create_otp, invalidate_otp, verify_otp_code
from app.utils.rate_limiter import enforce_rate_limit

router = APIRouter()
OTP_SEND_RATE_LIMIT = int(os.getenv("OTP_SEND_RATE_LIMIT", "5"))
OTP_SEND_RATE_WINDOW_SECONDS = int(os.getenv("OTP_SEND_RATE_WINDOW_SECONDS", "600"))
OTP_VERIFY_RATE_LIMIT = int(os.getenv("OTP_VERIFY_RATE_LIMIT", "10"))
OTP_VERIFY_RATE_WINDOW_SECONDS = int(os.getenv("OTP_VERIFY_RATE_WINDOW_SECONDS", "600"))
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
OTP_ALLOW_DEV_CODE = os.getenv(
    "OTP_ALLOW_DEV_CODE",
    "true" if APP_ENV != "production" else "false",
).lower() == "true"


class OTPRequest(BaseModel):
    email: EmailStr
    channel: Literal["email", "sms"] = "email"
    phone: str = Field(default="", max_length=20)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()


class VerifyOTP(OTPRequest):
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


def get_destination(data: OTPRequest) -> str:
    if data.channel == "email":
        return str(data.email)
    if not data.phone:
        raise HTTPException(status_code=400, detail="Phone number is required for SMS OTP")
    try:
        return normalize_phone(data.phone)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.get("/channels")
async def get_otp_channels():
    return {
        "channels": {
            "email": email_is_configured() or OTP_ALLOW_DEV_CODE,
            "sms": sms_is_configured() or OTP_ALLOW_DEV_CODE,
        },
        "delivery_configured": {
            "email": email_is_configured(),
            "sms": sms_is_configured(),
        },
        "dev_code_enabled": OTP_ALLOW_DEV_CODE,
    }


@router.post("/send-otp")
async def send_otp(data: OTPRequest, request: Request):
    destination = get_destination(data)
    enforce_rate_limit(
        request,
        f"otp-send-{data.channel}",
        OTP_SEND_RATE_LIMIT,
        OTP_SEND_RATE_WINDOW_SECONDS,
        destination,
    )

    if data.channel == "email" and not email_is_configured() and not OTP_ALLOW_DEV_CODE:
        raise HTTPException(status_code=503, detail="Email OTP delivery is not configured")
    if data.channel == "sms" and not sms_is_configured() and not OTP_ALLOW_DEV_CODE:
        raise HTTPException(status_code=503, detail="Phone OTP delivery is not configured")

    try:
        otp = await create_otp(
            str(data.email),
            purpose="registration",
            channel=data.channel,
            destination=destination,
        )

        if OTP_ALLOW_DEV_CODE and (
            (data.channel == "email" and not email_is_configured())
            or (data.channel == "sms" and not sms_is_configured())
        ):
            return {
                "message": "Development OTP generated.",
                "channel": data.channel,
                "dev_otp": otp,
            }

        if data.channel == "email":
            await send_email_otp(destination, otp)
        else:
            await send_sms_otp(destination, otp)
    except ValueError as error:
        raise HTTPException(status_code=429, detail=str(error))
    except OTPDeliveryError as error:
        await invalidate_otp(str(data.email), purpose="registration")
        raise HTTPException(status_code=503, detail=str(error))

    return {
        "message": f"OTP sent by {data.channel}.",
        "channel": data.channel,
    }


@router.post("/verify-otp")
async def verify_otp(data: VerifyOTP, request: Request):
    destination = get_destination(data)
    enforce_rate_limit(
        request,
        f"otp-verify-{data.channel}",
        OTP_VERIFY_RATE_LIMIT,
        OTP_VERIFY_RATE_WINDOW_SECONDS,
        destination,
    )

    success = await verify_otp_code(
        str(data.email),
        data.otp,
        purpose="registration",
        channel=data.channel,
        destination=destination,
    )
    if not success:
        return {"success": False, "message": "Invalid or expired OTP"}

    return {
        "success": True,
        "message": "OTP verified successfully",
        "channel": data.channel,
    }
