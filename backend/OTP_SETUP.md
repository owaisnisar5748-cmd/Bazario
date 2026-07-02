# Real OTP Delivery

Bazario supports two registration OTP channels:

- SMTP email
- Twilio SMS

OTP values are hashed before being stored in the SQL document store. Expired OTP records are rejected during verification.

## Email with Gmail

1. Enable 2-Step Verification on the Google account.
2. Create a Google App Password.
3. Add these values to `backend/.env`:

```env
MAIL_USERNAME=your-account@gmail.com
MAIL_PASSWORD=your-16-character-app-password
MAIL_FROM=your-account@gmail.com
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_STARTTLS=true
MAIL_SSL_TLS=false
```

Do not use the normal Google account password.

## Phone SMS with Twilio

Create a Twilio account and sender number, then configure:

```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
DEFAULT_PHONE_COUNTRY_CODE=+91
```

Twilio trial accounts can generally send only to verified recipient numbers. Country-specific sender registration and messaging regulations may also apply.

## Development codes

Real delivery is required by default. To deliberately expose OTPs in local API responses:

```env
OTP_ALLOW_DEV_CODE=true
```

Never enable this in production.

Restart the backend after changing `.env`, then audit configuration:

```powershell
backend\venv\Scripts\python.exe backend\scripts\audit_secrets.py
```
