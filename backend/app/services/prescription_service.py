import hashlib
import json

from app.db.database import database


def requires_prescription(product: dict):
    return (
        product.get("category") == "medicines"
        and str(product.get("details", {}).get("prescriptionRequired", "")).strip().lower()
        == "yes"
    )


def prescription_cart_key(items):
    required_items = [
        {
            "product_id": item["product_id"],
            "quantity": int(item["quantity"]),
            "selected_options": item.get("selected_options", {}),
        }
        for item in items
        if item.get("requires_prescription")
    ]
    if not required_items:
        return ""
    payload = json.dumps(
        sorted(required_items, key=lambda item: (item["product_id"], json.dumps(item["selected_options"], sort_keys=True))),
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def get_matching_prescription(username: str, cart_key: str):
    if not cart_key:
        return None
    return await database.prescriptions.find_one(
        {"username": username, "cart_key": cart_key},
        sort=[("created_at", -1)],
    )


def prescription_status(record):
    if not record:
        return "missing"
    reviews = record.get("reviews", [])
    if any(review.get("status") == "rejected" for review in reviews):
        return "rejected"
    if reviews and all(review.get("status") == "approved" for review in reviews):
        return "approved"
    return "pending"
