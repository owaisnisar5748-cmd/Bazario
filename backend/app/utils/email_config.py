from fastapi_mail import ConnectionConfig
import os

mail_username = os.getenv("MAIL_USERNAME", "development@example.com")

conf = ConnectionConfig(

    MAIL_USERNAME = mail_username,

    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", ""),

    MAIL_FROM = os.getenv("MAIL_FROM", mail_username),

    MAIL_PORT = int(os.getenv("MAIL_PORT", "587")),

    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com"),

    MAIL_STARTTLS = os.getenv("MAIL_STARTTLS", "true").lower() == "true",

    MAIL_SSL_TLS = os.getenv("MAIL_SSL_TLS", "false").lower() == "true",

    USE_CREDENTIALS = bool(os.getenv("MAIL_PASSWORD"))
)
