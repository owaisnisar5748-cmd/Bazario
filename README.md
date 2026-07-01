# Bazario

Bazario is a full-stack marketplace for customers, sellers, and administrators.
It includes OTP registration, role-protected accounts, category-specific products,
inventory variants, image uploads, cart and wishlist flows, prescription review,
Razorpay or cash-on-delivery checkout, order tracking, returns, invoices,
notifications, and dispute management.

## Stack

- React 18 served by Nginx
- FastAPI served by Uvicorn
- MongoDB 8
- JWT authentication
- Cloudinary product images
- SMTP or Twilio OTP delivery
- Razorpay online payments

## Local Development

Create `backend/.env` from `backend/.env.example`, generate a real secret, then run:

```powershell
python backend/scripts/rotate_secret_key.py
docker compose up --build
```

Open `http://localhost:3000`. The API remains available at
`http://localhost:8000`, with readiness at `/ready`.

## Production Deployment

1. Create the production environment file:

```powershell
Copy-Item .env.production.example .env.production
```

2. Replace every placeholder with real provider credentials and your HTTPS domain.

3. Validate configuration:

```powershell
npm run deploy:check
npm run deploy:config
```

4. Start the production stack:

```powershell
npm run deploy:up
```

Only the Nginx frontend is publicly exposed. It proxies `/api` to the private
backend network, while MongoDB and FastAPI remain internal.

Terminate TLS at your cloud load balancer or HTTPS reverse proxy and forward
traffic to `HTTP_PORT` (default `80`). Set `ALLOWED_ORIGINS` to the final HTTPS
frontend origin.

## Production Requirements

- A strong JWT `SECRET_KEY`
- A strong MongoDB root password or a managed MongoDB URI
- SMTP or Twilio credentials for real OTP delivery
- Cloudinary credentials for seller image uploads
- Razorpay credentials for UPI and card payments
- HTTPS, DNS, backups, monitoring, and provider-side secret rotation

## Verification

```powershell
cd backend
python -m compileall app main.py
python -m unittest discover -s tests -p "test_*.py"

cd ../frontend
npm.cmd test -- --watchAll=false
npm.cmd run build
```

Health endpoints:

- Nginx: `/health`
- FastAPI liveness through proxy: `/api/health`
- FastAPI database readiness through proxy: `/api/ready`
