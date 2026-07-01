from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator
import bcrypt
from jose import jwt
from datetime import datetime, timedelta
from typing import Literal, Optional
from pymongo.errors import PyMongoError
import os

from app.db.database import database
from app.services.otp_delivery import (
    OTPDeliveryError,
    email_is_configured,
    normalize_phone,
    send_email_otp,
)
from app.services.otp_service import (
    consume_verification,
    create_otp,
    invalidate_otp,
    verify_otp_code,
)
from app.utils.auth_handler import get_current_user
from app.utils.rate_limiter import enforce_rate_limit
from app.config.security import validate_secret_key

router = APIRouter()

# JWT settings
SECRET_KEY = validate_secret_key()
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
LOGIN_RATE_LIMIT = int(os.getenv("LOGIN_RATE_LIMIT", "10"))
LOGIN_RATE_WINDOW_SECONDS = int(os.getenv("LOGIN_RATE_WINDOW_SECONDS", "300"))
REGISTER_RATE_LIMIT = int(os.getenv("REGISTER_RATE_LIMIT", "5"))
REGISTER_RATE_WINDOW_SECONDS = int(os.getenv("REGISTER_RATE_WINDOW_SECONDS", "600"))
PASSWORD_RESET_RATE_LIMIT = int(os.getenv("PASSWORD_RESET_RATE_LIMIT", "5"))
PASSWORD_RESET_RATE_WINDOW_SECONDS = int(os.getenv("PASSWORD_RESET_RATE_WINDOW_SECONDS", "900"))


# --------------------
# USER MODEL
# --------------------
class User(BaseModel):
    username: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: Literal["customer", "seller"] = "customer"
    firstName: str = Field(min_length=1, max_length=60)
    lastName: str = Field(min_length=1, max_length=60)
    phone: Optional[str] = Field(default="", max_length=20)
    gender: Optional[str] = ""

    @field_validator("username")
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()

    @field_validator("firstName", "lastName")
    @classmethod
    def normalize_name(cls, value):
        return value.strip()


class LoginRequest(BaseModel):
    username: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()


class PasswordResetRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).strip().lower()


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


class ProfileUpdate(BaseModel):
    firstName: str = Field(min_length=1, max_length=60)
    lastName: str = Field(min_length=1, max_length=60)
    phone: str = Field(default="", max_length=20)
    gender: str = Field(default="", max_length=30)
    preferences: dict[str, bool] = Field(default_factory=dict)


class SellerOnboardingUpdate(BaseModel):
    store_name: str = Field(min_length=2, max_length=90)
    business_phone: str = Field(min_length=7, max_length=20)
    pickup_address: str = Field(min_length=8, max_length=240)
    business_id: str = Field(default="", max_length=80)
    payout_name: str = Field(min_length=2, max_length=90)
    payout_upi: str = Field(default="", max_length=80)
    bank_account: str = Field(default="", max_length=40)
    bank_ifsc: str = Field(default="", max_length=20)


def seller_onboarding_status(onboarding: dict | None):
    onboarding = onboarding or {}
    required_fields = [
        "store_name",
        "business_phone",
        "pickup_address",
        "payout_name",
    ]
    payout_ready = bool(onboarding.get("payout_upi") or (onboarding.get("bank_account") and onboarding.get("bank_ifsc")))
    completed_fields = sum(bool(str(onboarding.get(field, "")).strip()) for field in required_fields)
    completion = round(((completed_fields + int(payout_ready)) / (len(required_fields) + 1)) * 100)
    return {
        "completed": completed_fields == len(required_fields) and payout_ready,
        "completion": completion,
        "missing": [
            label
            for field, label in [
                ("store_name", "Store name"),
                ("business_phone", "Business phone"),
                ("pickup_address", "Pickup address"),
                ("payout_name", "Payout holder name"),
            ]
            if not str(onboarding.get(field, "")).strip()
        ] + ([] if payout_ready else ["UPI ID or bank details"]),
    }


def serialize_user(db_user):
    first_name = db_user.get("firstName", "")
    last_name = db_user.get("lastName", "")
    full_name = " ".join(part for part in [first_name, last_name] if part).strip()

    seller_onboarding = db_user.get("seller_onboarding", {})
    onboarding_status = seller_onboarding_status(seller_onboarding)

    return {
        "username": db_user["username"],
        "email": db_user["username"],
        "firstName": first_name,
        "lastName": last_name,
        "name": full_name,
        "phone": db_user.get("phone", ""),
        "gender": db_user.get("gender", ""),
        "role": db_user.get("role", "customer"),
        "seller_onboarding": seller_onboarding,
        "seller_onboarding_completed": onboarding_status["completed"],
        "seller_onboarding_completion": onboarding_status["completion"],
        "seller_onboarding_missing": onboarding_status["missing"],
        "preferences": {
            "order_updates": bool(db_user.get("preferences", {}).get("order_updates", True)),
            "account_alerts": bool(db_user.get("preferences", {}).get("account_alerts", True)),
            "marketplace_news": bool(db_user.get("preferences", {}).get("marketplace_news", False)),
            "seller_activity": bool(db_user.get("preferences", {}).get("seller_activity", True)),
        },
    }


def hash_password(password: str) -> str:
    encoded = password.encode("utf-8")
    if len(encoded) > 72:
        raise HTTPException(status_code=400, detail="Password is too long")
    return bcrypt.hashpw(encoded, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# --------------------
# REGISTER
# --------------------
@router.post("/register")
async def register(user: User, request: Request):
    enforce_rate_limit(
        request,
        "register",
        REGISTER_RATE_LIMIT,
        REGISTER_RATE_WINDOW_SECONDS,
        user.username,
    )

    try:
        verification = await consume_verification(user.username)
        if not verification:
            raise HTTPException(status_code=400, detail="Verify your email or phone before registering")
        if verification.get("channel") == "sms":
            if not user.phone:
                raise HTTPException(status_code=400, detail="Use the verified phone number to register")
            try:
                submitted_phone = normalize_phone(user.phone)
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error))
            if submitted_phone != verification.get("destination"):
                raise HTTPException(status_code=400, detail="Use the verified phone number to register")

        # check existing user
        existing_user = await database.users.find_one(
            {"username": user.username}
        )

        if existing_user:
            raise HTTPException(status_code=409, detail="An account with this email already exists")

        # hash password
        hashed_password = hash_password(user.password)

        # save user
        user_doc = {
            "username": user.username,
            "password": hashed_password,
            "role": user.role,
            "firstName": user.firstName.strip(),
            "lastName": user.lastName.strip(),
            "phone": user.phone.strip() if user.phone else "",
            "gender": user.gender,
            "createdAt": datetime.utcnow(),
            "token_version": 0,
            "seller_onboarding": {},
        }

        await database.users.insert_one(user_doc)

        return {
            "message": "User registered successfully",
            "user": serialize_user(user_doc)
        }
    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed. Check MongoDB connection and try again."
        )


# --------------------
# LOGIN
# --------------------
@router.post("/login")
async def login(credentials: LoginRequest, request: Request):
    enforce_rate_limit(
        request,
        "login",
        LOGIN_RATE_LIMIT,
        LOGIN_RATE_WINDOW_SECONDS,
        credentials.username,
    )

    try:
        db_user = await database.users.find_one(
            {"username": credentials.username}
        )
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed. Check MongoDB connection and try again."
        )

    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # verify password
    if not verify_password(credentials.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # create JWT token
    token = jwt.encode(
        {
            "sub": credentials.username,
            "role": db_user.get("role", "customer"),
            "ver": int(db_user.get("token_version", 0)),
            "exp": datetime.utcnow()
            + timedelta(
                minutes=ACCESS_TOKEN_EXPIRE_MINUTES
            )
        },
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": serialize_user(db_user)
    }


@router.post("/forgot-password")
async def forgot_password(data: PasswordResetRequest, request: Request):
    enforce_rate_limit(
        request,
        "forgot-password",
        PASSWORD_RESET_RATE_LIMIT,
        PASSWORD_RESET_RATE_WINDOW_SECONDS,
        data.email,
    )

    try:
        user_exists = await database.users.find_one({"username": data.email}, {"_id": 1})
        if not email_is_configured():
            raise HTTPException(status_code=503, detail="Password reset email delivery is not configured")
        if user_exists:
            otp = await create_otp(
                data.email,
                purpose="password_reset",
                channel="email",
                destination=str(data.email),
            )
            try:
                await send_email_otp(str(data.email), otp, purpose="password_reset")
            except OTPDeliveryError as error:
                await invalidate_otp(data.email, purpose="password_reset")
                raise HTTPException(status_code=503, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=429, detail=str(error))
    except HTTPException:
        raise
    except PyMongoError:
        raise HTTPException(status_code=503, detail="Database connection failed. Try again shortly.")

    return {
        "message": "If an account exists for that email, a reset code has been sent."
    }


@router.post("/reset-password")
async def reset_password(data: PasswordResetConfirm, request: Request):
    enforce_rate_limit(
        request,
        "reset-password",
        PASSWORD_RESET_RATE_LIMIT,
        PASSWORD_RESET_RATE_WINDOW_SECONDS,
        data.email,
    )

    if not await verify_otp_code(
        data.email,
        data.otp,
        purpose="password_reset",
        channel="email",
        destination=str(data.email),
    ):
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    if not await consume_verification(data.email, purpose="password_reset"):
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    try:
        result = await database.users.update_one(
            {"username": data.email},
            {
                "$set": {"password": hash_password(data.new_password)},
                "$inc": {"token_version": 1},
            }
        )
    except PyMongoError:
        raise HTTPException(status_code=503, detail="Database connection failed. Try again shortly.")

    if result.matched_count == 0:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    return {"message": "Password updated successfully. You can now sign in."}


@router.post("/change-password")
async def change_password(
    data: PasswordChange,
    current_user: dict = Depends(get_current_user),
):
    if not verify_password(data.current_password, current_user.get("password", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if verify_password(data.new_password, current_user.get("password", "")):
        raise HTTPException(status_code=400, detail="New password must be different")

    await database.users.update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {"password": hash_password(data.new_password)},
            "$inc": {"token_version": 1},
        },
    )
    return {"message": "Password changed. Sign in again on all devices."}


@router.post("/revoke-sessions")
async def revoke_sessions(current_user: dict = Depends(get_current_user)):
    await database.users.update_one(
        {"_id": current_user["_id"]},
        {"$inc": {"token_version": 1}},
    )
    return {"message": "All active sessions have been signed out."}


@router.get("/me")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return {"user": serialize_user(current_user)}


@router.get("/seller-onboarding")
async def get_seller_onboarding(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can access onboarding")
    onboarding = current_user.get("seller_onboarding", {})
    return {
        "onboarding": onboarding,
        "status": seller_onboarding_status(onboarding),
    }


@router.put("/seller-onboarding")
async def update_seller_onboarding(
    update: SellerOnboardingUpdate,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can update onboarding")
    if not update.payout_upi.strip() and not (update.bank_account.strip() and update.bank_ifsc.strip()):
        raise HTTPException(status_code=400, detail="Add either a UPI ID or bank account with IFSC")

    onboarding = {
        "store_name": update.store_name.strip(),
        "business_phone": update.business_phone.strip(),
        "pickup_address": update.pickup_address.strip(),
        "business_id": update.business_id.strip(),
        "payout_name": update.payout_name.strip(),
        "payout_upi": update.payout_upi.strip(),
        "bank_account": update.bank_account.strip(),
        "bank_ifsc": update.bank_ifsc.strip().upper(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    status = seller_onboarding_status(onboarding)
    await database.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"seller_onboarding": onboarding}},
    )
    current_user["seller_onboarding"] = onboarding
    return {
        "message": "Seller onboarding saved",
        "onboarding": onboarding,
        "status": status,
        "user": serialize_user(current_user),
    }


@router.put("/me")
async def update_profile(
    update: ProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    values = {
        "firstName": update.firstName.strip(),
        "lastName": update.lastName.strip(),
        "phone": update.phone.strip(),
        "gender": update.gender,
        "preferences": {
            "order_updates": bool(update.preferences.get("order_updates", True)),
            "account_alerts": bool(update.preferences.get("account_alerts", True)),
            "marketplace_news": bool(update.preferences.get("marketplace_news", False)),
            "seller_activity": bool(update.preferences.get("seller_activity", True)),
        },
    }
    await database.users.update_one({"_id": current_user["_id"]}, {"$set": values})
    current_user.update(values)
    return {"message": "Profile updated", "user": serialize_user(current_user)}
