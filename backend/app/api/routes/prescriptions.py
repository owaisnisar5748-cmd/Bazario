from datetime import datetime, timedelta, timezone
from io import BytesIO

from bson import Binary, ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.routes.orders import get_checkout_items
from app.db.database import database
from app.services.prescription_service import (
    get_matching_prescription,
    prescription_cart_key,
    prescription_status,
)
from app.services.notification_service import create_notification, notify_many
from app.utils.auth_handler import get_current_user, seller_only

router = APIRouter()

MAX_PRESCRIPTION_BYTES = 5 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "application/pdf",
}
PRESCRIPTION_RETENTION_DAYS = 30


class PrescriptionDecision(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    note: str = Field(default="", max_length=500)


def serialize_prescription(record):
    return {
        "_id": str(record["_id"]),
        "filename": record["filename"],
        "content_type": record["content_type"],
        "created_at": record["created_at"],
        "status": prescription_status(record),
        "reviews": record.get("reviews", []),
    }


def has_valid_file_signature(content_type: str, content: bytes):
    signatures = {
        "image/jpeg": lambda value: value.startswith(b"\xff\xd8\xff"),
        "image/png": lambda value: value.startswith(b"\x89PNG\r\n\x1a\n"),
        "application/pdf": lambda value: value.startswith(b"%PDF-"),
    }
    return signatures.get(content_type, lambda value: False)(content)


def safe_filename(value: str):
    cleaned = "".join(
        character
        for character in value
        if character.isalnum() or character in {".", "-", "_", " "}
    ).strip()
    return cleaned[:150] or "prescription"


@router.get("/cart-status")
async def get_cart_prescription_status(
    current_user: dict = Depends(get_current_user),
):
    items = await get_checkout_items(
        current_user["username"],
        enforce_prescription=False,
    )
    cart_key = prescription_cart_key(items)
    if not cart_key:
        return {"required": False, "status": "not_required", "prescription": None}

    record = await get_matching_prescription(current_user["username"], cart_key)
    return {
        "required": True,
        "status": prescription_status(record),
        "prescription": serialize_prescription(record) if record else None,
    }


@router.post("/upload")
async def upload_prescription(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Upload a JPG, PNG, or PDF prescription.",
        )

    content = await file.read(MAX_PRESCRIPTION_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Prescription file is empty.")
    if len(content) > MAX_PRESCRIPTION_BYTES:
        raise HTTPException(status_code=413, detail="Prescription must be 5 MB or smaller.")
    if not has_valid_file_signature(file.content_type, content):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file content does not match its file type.",
        )

    username = current_user["username"]
    items = await get_checkout_items(username, enforce_prescription=False)
    cart_key = prescription_cart_key(items)
    required_items = [item for item in items if item.get("requires_prescription")]
    if not cart_key:
        raise HTTPException(
            status_code=400,
            detail="Your cart does not contain a prescription-required medicine.",
        )

    sellers = sorted({item["seller"] for item in required_items})
    now = datetime.now(timezone.utc)
    record = {
        "username": username,
        "cart_key": cart_key,
        "filename": safe_filename(file.filename or "prescription"),
        "content_type": file.content_type,
        "size": len(content),
        "document": Binary(content),
        "product_ids": sorted({item["product_id"] for item in required_items}),
        "reviews": [
            {"seller": seller, "status": "pending", "note": ""}
            for seller in sellers
        ],
        "created_at": now,
        "updated_at": now,
        "expires_at": now + timedelta(days=PRESCRIPTION_RETENTION_DAYS),
    }
    result = await database.prescriptions.insert_one(record)
    record["_id"] = result.inserted_id
    await notify_many(
        sellers,
        notification_type="prescription_review",
        title="Prescription awaiting review",
        message=f"Review {record['filename']} before the customer can checkout.",
        link="/seller-orders",
        metadata={"prescription_id": str(result.inserted_id)},
    )
    return {
        "message": "Prescription uploaded for seller review.",
        "prescription": serialize_prescription(record),
    }


@router.get("/seller")
async def get_seller_prescriptions(current_seller: str = Depends(seller_only)):
    prescriptions = []
    async for record in database.prescriptions.find(
        {"reviews.seller": current_seller}
    ).sort("created_at", -1):
        review = next(
            item for item in record["reviews"]
            if item["seller"] == current_seller
        )
        prescriptions.append(
            {
                **serialize_prescription(record),
                "username": record["username"],
                "product_ids": record.get("product_ids", []),
                "seller_review": review,
            }
        )
    return {"prescriptions": prescriptions}


@router.get("/{prescription_id}/document")
async def get_prescription_document(
    prescription_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        object_id = ObjectId(prescription_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid prescription")

    record = await database.prescriptions.find_one({"_id": object_id})
    if not record:
        raise HTTPException(status_code=404, detail="Prescription not found")

    username = current_user["username"]
    role = current_user.get("role")
    seller_allowed = any(
        review.get("seller") == username for review in record.get("reviews", [])
    )
    if record["username"] != username and not (role == "seller" and seller_allowed):
        raise HTTPException(status_code=403, detail="Prescription access denied")

    return StreamingResponse(
        BytesIO(bytes(record["document"])),
        media_type=record["content_type"],
        headers={
            "Content-Disposition": f'inline; filename="{safe_filename(record["filename"])}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.put("/{prescription_id}/decision")
async def decide_prescription(
    prescription_id: str,
    data: PrescriptionDecision,
    current_seller: str = Depends(seller_only),
):
    try:
        object_id = ObjectId(prescription_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid prescription")

    status = "approved" if data.decision == "approve" else "rejected"
    result = await database.prescriptions.update_one(
        {
            "_id": object_id,
            "reviews": {
                "$elemMatch": {
                    "seller": current_seller,
                    "status": "pending",
                }
            },
        },
        {
            "$set": {
                "reviews.$[review].status": status,
                "reviews.$[review].note": data.note.strip(),
                "reviews.$[review].decided_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        },
        array_filters=[
            {
                "review.seller": current_seller,
                "review.status": "pending",
            }
        ],
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Pending prescription review not found")

    record = await database.prescriptions.find_one({"_id": object_id})
    overall_status = prescription_status(record)
    await create_notification(
        username=record["username"],
        notification_type="prescription_decision",
        title=(
            f"Prescription {overall_status}"
            if overall_status != "pending"
            else "Prescription review updated"
        ),
        message=(
            "Your prescription was approved. You can now complete checkout."
            if overall_status == "approved"
            else (
                "Your prescription was rejected. Upload a new valid document."
                if overall_status == "rejected"
                else "One seller completed their review. Another review is still pending."
            )
        ),
        link="/checkout",
        metadata={"prescription_id": prescription_id, "status": overall_status},
    )
    return {
        "message": f"Prescription {status}.",
        "status": overall_status,
    }
