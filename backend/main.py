from contextlib import asynccontextmanager
import asyncio
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
import os
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")

from app.config.security import validate_security_config

validate_security_config()

from app.api.routes import auth, products, otp, payment, address, reviews, wishlist, admin, cart, orders, prescriptions, notifications, support
from app.db.database import client, database

logger = logging.getLogger("bazario")
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()


async def create_database_indexes():
    await database.users.create_index("username", unique=True)
    cart_indexes = await database.cart.index_information()
    if "username_1_product_id_1" in cart_indexes:
        await database.cart.drop_index("username_1_product_id_1")
    await database.cart.update_many(
        {"selected_size": {"$exists": False}},
        {"$set": {"selected_size": ""}},
    )
    await database.cart.update_many(
        {"selected_color": {"$exists": False}},
        {"$set": {"selected_color": ""}},
    )
    await database.cart.update_many(
        {"selected_options": {"$exists": False}},
        {"$set": {"selected_options": {}}},
    )
    await database.cart.update_many(
        {"selected_variant_key": {"$exists": False}},
        {"$set": {"selected_variant_key": ""}},
    )
    if "unique_customer_product_size" in cart_indexes:
        await database.cart.drop_index("unique_customer_product_size")
    if "unique_customer_product_variant" in cart_indexes:
        await database.cart.drop_index("unique_customer_product_variant")
    await database.cart.create_index(
        [
            ("username", 1),
            ("product_id", 1),
            ("selected_variant_key", 1),
        ],
        unique=True,
        name="unique_customer_product_variant",
    )
    await database.wishlist.create_index([("username", 1), ("product_id", 1)], unique=True)
    await database.reviews.create_index([("username", 1), ("product_id", 1)], unique=True)
    await database.reviews.create_index([("seller", 1), ("created_at", -1)])
    await database.products.create_index("seller")
    await database.products.create_index("approval_status")
    await database.products.update_many(
        {"approval_status": {"$in": ["pending", "rejected"]}},
        {
            "$set": {
                "approval_status": "approved",
                "approval_note": "Auto-approved while admin moderation is disabled.",
            }
        },
    )
    await database.products.update_many(
        {"approval_status": {"$exists": False}},
        {"$set": {"approval_status": "approved"}},
    )
    await database.products.create_index("seed_key", unique=True, sparse=True)
    await database.orders.create_index("username")
    await database.orders.create_index("products.seller")
    await database.orders.create_index("dispute.status")
    await database.orders.create_index("shipments.tracking_number")
    await database.prescriptions.create_index([("username", 1), ("cart_key", 1)])
    await database.prescriptions.create_index("reviews.seller")
    await database.prescriptions.create_index("expires_at", expireAfterSeconds=0)
    await database.notifications.create_index([("username", 1), ("created_at", -1)])
    await database.notifications.create_index(
        [("username", 1), ("read", 1)]
    )
    await database.notifications.create_index("expires_at", expireAfterSeconds=0)
    await database.support_tickets.create_index([("username", 1), ("updated_at", -1)])
    await database.support_tickets.create_index([("status", 1), ("updated_at", -1)])
    await database.payment_intents.create_index("razorpay_order_id", unique=True)
    await database.payment_intents.create_index(
        "expires_at",
        expireAfterSeconds=0,
    )
    await database.otp_codes.create_index("expires_at", expireAfterSeconds=0)
    await database.otp_verifications.create_index("expires_at", expireAfterSeconds=0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await asyncio.wait_for(create_database_indexes(), timeout=10)
    except Exception as error:
        logger.warning("Database indexes could not be initialized during startup: %s", error)
    yield
    client.close()


app = FastAPI(
    title="Bazario API",
    version="1.0.0",
    description="Production API for the Bazario marketplace.",
    lifespan=lifespan,
    docs_url=None if APP_ENV == "production" else "/docs",
    redoc_url=None if APP_ENV == "production" else "/redoc",
    openapi_url=None if APP_ENV == "production" else "/openapi.json",
)

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

@app.get("/")
def home():
    return {"service": "Bazario API", "status": "ok", "version": app.version}

@app.get("/health")
async def health():
    return {"status": "alive", "service": "Bazario API"}


@app.get("/ready")
async def readiness():
    try:
        await asyncio.wait_for(database.command("ping"), timeout=5)
        return {"status": "ready", "database": "connected"}
    except Exception:
        raise HTTPException(status_code=503, detail="MongoDB connection failed")

app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(products.router, prefix="/products", tags=["Products"])
app.include_router(cart.router, prefix="/cart", tags=["Cart"])
app.include_router(orders.router, prefix="/orders", tags=["Orders"])
app.include_router(prescriptions.router, prefix="/prescriptions", tags=["Prescriptions"])
app.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
app.include_router(otp.router, prefix="/otp", tags=["OTP Authentication"])
app.include_router(payment.router, prefix="/payment", tags=["Payments"])
app.include_router(address.router, prefix="/address", tags=["Addresses"])
app.include_router(reviews.router, prefix="/reviews", tags=["Reviews"])
app.include_router(wishlist.router, prefix="/wishlist", tags=["Wishlist"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(support.router, prefix="/support", tags=["Support"])

