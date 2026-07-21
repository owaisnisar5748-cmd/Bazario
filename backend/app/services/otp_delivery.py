import logging
import os
import re
import socket
import smtplib

from fastapi_mail import FastMail, MessageSchema

from app.utils.email_config import conf

logger = logging.getLogger("bazario.otp")


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
    return all(
        value.strip()
        for value in (
            os.getenv("MAIL_USERNAME", ""),
            os.getenv("MAIL_PASSWORD", ""),
        )
    )


def _mail_delivery_message(error: Exception) -> str:
    current = error
    seen = set()
    while current and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, smtplib.SMTPAuthenticationError):
            return "Gmail rejected the sender login. Use a Gmail App Password, not your normal Gmail password."
        if isinstance(current, smtplib.SMTPRecipientsRefused):
            return "Email provider rejected the recipient address. Check the email and try again."
        if isinstance(current, smtplib.SMTPSenderRefused):
            return "Email provider rejected MAIL_FROM. Set MAIL_FROM to the same verified Gmail sender."
        if isinstance(current, (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, socket.gaierror, TimeoutError)):
            return "Could not connect to the email provider. Check MAIL_SERVER, MAIL_PORT, and TLS settings."
        current = current.__cause__ or current.__context__
    return "Email provider could not deliver the OTP. Check the sender email and Gmail App Password."


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
        logger.warning("Email OTP delivery failed: %s", error)
        raise OTPDeliveryError(_mail_delivery_message(error)) from error
