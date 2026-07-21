# Real OTP Delivery

Bazario supports email registration OTP through SMTP.

OTP values are hashed before being stored in the SQL document store. Expired OTP records are rejected during verification.

In production, Bazario requires real OTP verification. Development response codes are ignored when `APP_ENV=production`, even if `OTP_ALLOW_DEV_CODE=true` is accidentally set.

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
Paste the Gmail App Password without spaces; the backend also strips accidental spaces before connecting.

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

For Railway, add the same variables in the backend service Variables tab, then redeploy the backend.
