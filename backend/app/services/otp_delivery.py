import asyncio
import base64
import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

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


def sms_is_configured() -> bool:
    return all(
        os.getenv(key)
        for key in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER")
    )


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


def _send_twilio_sms(phone: str, message: str):
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_number = os.getenv("TWILIO_FROM_NUMBER", "")
    endpoint = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    payload = urlencode({"To": phone, "From": from_number, "Body": message}).encode("utf-8")
    credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("ascii")
    request = Request(
        endpoint,
        data=payload,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=12) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise OTPDeliveryError("SMS provider could not deliver the OTP") from error

    if not result.get("sid"):
        raise OTPDeliveryError("SMS provider did not accept the OTP message")


async def send_sms_otp(phone: str, otp: str):
    if not sms_is_configured():
        raise OTPDeliveryError("Phone OTP is not configured")

    await asyncio.to_thread(
        _send_twilio_sms,
        phone,
        f"Your Bazario verification code is {otp}. It expires in 10 minutes. Do not share it.",
    )
