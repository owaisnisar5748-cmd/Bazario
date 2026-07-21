from fastapi_mail import ConnectionConfig
import os

raw_mail_username = os.getenv("MAIL_USERNAME", "").strip()
mail_password = os.getenv("MAIL_PASSWORD", "").replace(" ", "").strip()
raw_mail_from = os.getenv("MAIL_FROM", "").strip()
mail_username = raw_mail_username or "development@example.com"
mail_from = raw_mail_from or mail_username

conf = ConnectionConfig(

    MAIL_USERNAME = mail_username,

    MAIL_PASSWORD = mail_password,

    MAIL_FROM = mail_from,

    MAIL_PORT = int(os.getenv("MAIL_PORT", "587")),

    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com").strip(),

    MAIL_STARTTLS = os.getenv("MAIL_STARTTLS", "true").lower() == "true",

    MAIL_SSL_TLS = os.getenv("MAIL_SSL_TLS", "false").lower() == "true",

    USE_CREDENTIALS = bool(raw_mail_username and mail_password)
)
