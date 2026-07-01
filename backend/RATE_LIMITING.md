# Authentication Rate Limiting

Bazario rate-limits public authentication endpoints by client IP and normalized email identity.

Configured scopes:

- Login
- Registration
- Forgot password
- Password reset verification
- OTP sending
- OTP verification

Thresholds can be changed in `backend/.env`; see `backend/.env.example`.

The current limiter is in-memory and suitable for one backend process. Before running multiple Uvicorn workers or backend replicas, replace its storage with a shared service such as Redis.
