# Security Configuration

`backend/.env` is ignored by Git and must never be shared or committed.

Audit configuration without displaying secret values:

```powershell
backend\venv\Scripts\python.exe backend\scripts\audit_secrets.py
```

Generate and store a new strong JWT signing key:

```powershell
backend\venv\Scripts\python.exe backend\scripts\rotate_secret_key.py
```

Rotating `SECRET_KEY` invalidates all existing login sessions. Restart the backend afterward.

If a mail password, Cloudinary secret, Razorpay secret, or JWT key has ever been exposed, rotate it in the provider dashboard. Editing the local `.env` file alone does not revoke an exposed provider credential.
