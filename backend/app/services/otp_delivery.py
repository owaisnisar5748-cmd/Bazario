import os
import re

from fastapi_mail import FastMail, MessageSchema

from app.utils.email_config import conf


class OTPDeliveryError(RuntimeError):
    pass


def normalize_phone(phone: str) -> str:
    default_country_code = os.getenv("DEFAULT_PHONE_COUNTRY_CODE", "+91")
    value = re.sub(r"[^\d+]", "", phone.strip())
    if value.startswith("00"):
        value = f"+{value[2:]}"
    elif not value.startswith("+"):
        value = f"{default_country_code}{value.lstrip('0')}"

    if not re.fullmatch(r"\+[1-9]\d{7,14}", value):
        raise ValueError("Enter a valid phone number with country code")
    return value


def email_is_configured() -> bool:
    return bool(conf.MAIL_USERNAME and conf.MAIL_PASSWORD and conf.MAIL_FROM)


async def send_email_otp(email: str, otp: str, purpose: str = "registration"):
    if not email_is_configured():
        raise OTPDeliveryError("Email OTP is not configured")

    title = "Verify your Bazario email" if purpose == "registration" else "Reset your Bazario password"
    message = MessageSchema(
        subject=title,
        recipients=[email],
        body=f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px">
          <h2>{title}</h2>
          <p>Use this one-time verification code:</p>
          <div style="font-size:34px;font-weight:800;letter-spacing:8px;padding:18px;background:#f4f0e8">{otp}</div>
          <p>This code expires in 10 minutes. Never share it with anyone.</p>
        </div>
        """,
        subtype="html",
    )

    try:
        await FastMail(conf).send_message(message)
    except Exception as error:
        raise OTPDeliveryError("Email provider could not deliver the OTP") from error
