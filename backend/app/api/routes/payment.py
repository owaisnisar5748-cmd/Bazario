import asyncio
import hashlib
import hmac
import logging
import os
import json
from datetime import datetime, timedelta, timezone
from typing import Literal

import razorpay
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.routes.orders import (
    calculate_order_total,
    finalize_order,
    get_checkout_items,
    get_delivery_address,
)
from app.db.database import database
from app.utils.auth_handler import get_current_user

router = APIRouter()
logger = logging.getLogger("bazario.payments")

PAYMENT_INTENT_MINUTES = 30
PLACEHOLDER_VALUES = {
    "",
    "your-key-id",
    "your-key-secret",
    "replace-me",
    "changeme",
}


class PaymentOrderRequest(BaseModel):
    address_id: str
    payment_method: Literal["upi", "card"]


class VerifyPayment(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def get_razorpay_credentials():
    return (
        os.getenv("RAZORPAY_KEY_ID", "").strip(),
        os.getenv("RAZORPAY_KEY_SECRET", "").strip(),
    )


def is_razorpay_configured():
    key_id, key_secret = get_razorpay_credentials()
    return (
        key_id.lower() not in PLACEHOLDER_VALUES
        and key_secret.lower() not in PLACEHOLDER_VALUES
        and key_id.startswith(("rzp_test_", "rzp_live_"))
        and not key_id.startswith(("rzp_test__", "rzp_live__"))
    )


def get_razorpay_setup_message():
    key_id, key_secret = get_razorpay_credentials()
    if (
        key_id.lower() in PLACEHOLDER_VALUES
        or key_secret.lower() in PLACEHOLDER_VALUES
    ):
        return "Add Razorpay test keys to backend/.env and restart the backend."
    if not key_id.startswith(("rzp_test_", "rzp_live_")) or key_id.startswith(
        ("rzp_test__", "rzp_live__")
    ):
        return "The Razorpay key ID in backend/.env has an invalid format."
    return None


def get_razorpay_client():
    if not is_razorpay_configured():
        raise HTTPException(
            status_code=503,
            detail="Online payments are not configured. Add valid Razorpay keys.",
        )
    return razorpay.Client(auth=get_razorpay_credentials())


def cart_signature(items):
    def selected_options(item):
        options = item.get("selected_options") or {}
        if options:
            return options
        return {
            key: value
            for key, value in {
                "size": item.get("selected_size", ""),
                "colour": item.get("selected_color", ""),
            }.items()
            if value
        }

    snapshot = "|".join(
        sorted(
            (
                f"{item['product_id']}:"
                f"{json.dumps(selected_options(item), sort_keys=True)}:"
                f"{item['quantity']}:{item['price']:.2f}"
            )
            for item in items
        )
    )
    return hashlib.sha256(snapshot.encode("utf-8")).hexdigest()


async def attempt_refund(client, payment_id: str, amount: int):
    try:
        refund = await asyncio.to_thread(
            client.payment.refund,
            payment_id,
            {
                "amount": amount,
                "notes": {"reason": "Bazario order could not be finalized"},
            },
        )
        return "refunded", refund.get("id")
    except Exception:
        return "refund_pending", None


@router.get("/config")
async def payment_config():
    configured = is_razorpay_configured()
    key_id, _ = get_razorpay_credentials()
    return {
        "configured": configured,
        "key_id": key_id if configured else None,
        "setup_message": None if configured else get_razorpay_setup_message(),
        "currency": "INR",
        "methods": ["cod", "upi", "card"],
    }


@router.post("/create-order")
async def create_payment_order(
    data: PaymentOrderRequest,
    current_user: dict = Depends(get_current_user),
):
    client = get_razorpay_client()
    username = current_user["username"]
    await get_delivery_address(username, data.address_id)
    cart_items = await get_checkout_items(username)
    total = calculate_order_total(cart_items)
    amount = int(round(total * 100))

    if amount < 100:
        raise HTTPException(
            status_code=400,
            detail="Online payment total must be at least Rs. 1.",
        )

    receipt = f"bz_{ObjectId()}"
    try:
        razorpay_order = await asyncio.to_thread(
            client.order.create,
            {
                "amount": amount,
                "currency": "INR",
                "receipt": receipt,
                "notes": {
                    "username": username,
                    "payment_method": data.payment_method,
                },
            },
        )
    except Exception as error:
        logger.exception("Razorpay order creation failed")
        error_message = str(error).lower()
        if "authentication failed" in error_message:
            detail = (
                "Razorpay rejected the configured key pair. Generate fresh test keys "
                "in the Razorpay Dashboard, update backend/.env, and restart the backend."
            )
        else:
            detail = "The payment gateway could not create an order. Try again."
        raise HTTPException(
            status_code=502,
            detail=detail,
        )

    now = datetime.now(timezone.utc)
    intent = {
        "razorpay_order_id": razorpay_order["id"],
        "username": username,
        "address_id": data.address_id,
        "payment_method": data.payment_method,
        "amount": amount,
        "currency": "INR",
        "cart_signature": cart_signature(cart_items),
        "status": "created",
        "created_at": now,
        "expires_at": now + timedelta(minutes=PAYMENT_INTENT_MINUTES),
    }
    await database.payment_intents.insert_one(intent)

    key_id, _ = get_razorpay_credentials()
    return {
        "key_id": key_id,
        "payment_method": data.payment_method,
        "order": {
            "id": razorpay_order["id"],
            "amount": amount,
            "currency": "INR",
        },
    }


@router.post("/verify")
async def verify_payment(
    data: VerifyPayment,
    current_user: dict = Depends(get_current_user),
):
    client = get_razorpay_client()
    username = current_user["username"]
    intent = await database.payment_intents.find_one(
        {
            "razorpay_order_id": data.razorpay_order_id,
            "username": username,
        }
    )
    if not intent:
        raise HTTPException(status_code=404, detail="Payment session not found.")

    if intent.get("status") == "completed":
        order = await database.orders.find_one(
            {"_id": ObjectId(intent["bazario_order_id"]), "username": username}
        )
        if order:
            order["_id"] = str(order["_id"])
            return {"message": "Payment already verified.", "order": order}

    expires_at = intent.get("expires_at")
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Payment session has expired.")

    _, key_secret = get_razorpay_credentials()
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, data.razorpay_signature):
        await database.payment_intents.update_one(
            {"_id": intent["_id"]},
            {"$set": {"status": "verification_failed"}},
        )
        raise HTTPException(status_code=400, detail="Payment verification failed.")

    claim = await database.payment_intents.update_one(
        {"_id": intent["_id"], "status": "created"},
        {"$set": {"status": "verifying", "payment_id": data.razorpay_payment_id}},
    )
    if claim.modified_count == 0:
        raise HTTPException(
            status_code=409,
            detail="This payment is already being processed.",
        )

    try:
        gateway_order, gateway_payment = await asyncio.gather(
            asyncio.to_thread(client.order.fetch, data.razorpay_order_id),
            asyncio.to_thread(client.payment.fetch, data.razorpay_payment_id),
        )
    except Exception:
        await database.payment_intents.update_one(
            {"_id": intent["_id"]},
            {"$set": {"status": "created"}},
        )
        raise HTTPException(
            status_code=502,
            detail="Could not confirm the payment with the gateway.",
        )

    payment_is_valid = (
        gateway_order.get("id") == data.razorpay_order_id
        and gateway_payment.get("order_id") == data.razorpay_order_id
        and gateway_order.get("status") == "paid"
        and gateway_payment.get("status") == "captured"
        and gateway_order.get("amount") == intent["amount"]
        and gateway_payment.get("amount") == intent["amount"]
        and gateway_order.get("currency") == intent["currency"]
        and gateway_payment.get("currency") == intent["currency"]
    )
    if not payment_is_valid:
        await database.payment_intents.update_one(
            {"_id": intent["_id"]},
            {"$set": {"status": "verification_failed"}},
        )
        raise HTTPException(
            status_code=400,
            detail="Payment details do not match this checkout.",
        )

    try:
        current_items = await get_checkout_items(username)
        if cart_signature(current_items) != intent["cart_signature"]:
            raise HTTPException(
                status_code=409,
                detail="Your cart changed during payment.",
            )

        order = await finalize_order(
            username,
            intent["address_id"],
            payment_method=intent["payment_method"],
            payment_status="paid",
            payment_details={
                "provider": "razorpay",
                "razorpay_order_id": data.razorpay_order_id,
                "razorpay_payment_id": data.razorpay_payment_id,
            },
        )
    except Exception as error:
        refund_status, refund_id = await attempt_refund(
            client,
            data.razorpay_payment_id,
            intent["amount"],
        )
        await database.payment_intents.update_one(
            {"_id": intent["_id"]},
            {
                "$set": {
                    "status": refund_status,
                    "refund_id": refund_id,
                    "failure_reason": str(error),
                }
            },
        )
        detail = (
            "Payment was refunded because the order could not be completed."
            if refund_status == "refunded"
            else "Payment succeeded, but the order needs support review. Do not pay again."
        )
        raise HTTPException(status_code=409, detail=detail)

    await database.payment_intents.update_one(
        {"_id": intent["_id"]},
        {
            "$set": {
                "status": "completed",
                "bazario_order_id": order["_id"],
                "completed_at": datetime.now(timezone.utc),
            }
        },
    )
    return {"message": "Payment verified and order placed.", "order": order}
