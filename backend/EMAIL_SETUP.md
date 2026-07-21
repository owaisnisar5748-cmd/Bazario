# Email Delivery

Bazario registration does not use OTP verification.

SMTP email is only used for password reset messages. To enable password reset email with Gmail:

```env
MAIL_USERNAME=your-account@gmail.com
MAIL_PASSWORD=your-16-character-app-password
MAIL_FROM=your-account@gmail.com
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_STARTTLS=true
MAIL_SSL_TLS=false
```

Use a Gmail App Password, not the normal Google account password. If `MAIL_FROM` is the same as `MAIL_USERNAME`, it can be omitted.
