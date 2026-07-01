from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.db.database import database
from bson import ObjectId
from bson.errors import InvalidId
from app.utils.auth_handler import admin_only
from app.services.notification_service import create_notification

router = APIRouter()


class DisputeDecision(BaseModel):
    decision: str = Field(pattern="^(resolve|reject|approve_refund)$")
    note: str = Field(min_length=5, max_length=1000)


class ProductReview(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    note: str = Field(default="", max_length=500)


# --------------------
# GET ALL USERS
# --------------------
@router.get("/users")
async def get_users(current_admin: str = Depends(admin_only)):

    users = []

    async for user in database.users.find():

        user["_id"] = str(user["_id"])

        user.pop("password", None)
        users.append(user)

    return {
        "users": users
    }


# --------------------
# GET ALL PRODUCTS
# --------------------
@router.get("/products")
async def get_products(current_admin: str = Depends(admin_only)):

    products = []

    async for product in database.products.find():

        product["_id"] = str(product["_id"])

        products.append(product)

    return {
        "products": products
    }


@router.put("/products/{product_id}/review")
async def review_product(
    product_id: str,
    data: ProductReview,
    current_admin: str = Depends(admin_only),
):
    try:
        object_id = ObjectId(product_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid product ID")

    product = await database.products.find_one({"_id": object_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    approval_status = "approved" if data.decision == "approve" else "rejected"
    updates = {
        "approval_status": approval_status,
        "approval_note": data.note.strip(),
        "reviewed_by": current_admin,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }
    if approval_status == "approved":
        updates["approved_at"] = updates["reviewed_at"]

    result = await database.products.update_one(
        {"_id": object_id},
        {"$set": updates},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Product review could not be saved")

    seller = product.get("seller")
    if seller:
        await create_notification(
            username=seller,
            notification_type="product_review",
            title="Product approved" if approval_status == "approved" else "Product needs changes",
            message=(
                f"{product.get('name', 'Your product')} is now live in the marketplace."
                if approval_status == "approved"
                else f"{product.get('name', 'Your product')} was rejected. {data.note.strip() or 'Please review the listing details.'}"
            ),
            link="/seller-dashboard",
            metadata={"product_id": product_id, "approval_status": approval_status},
        )

    product.update(updates)
    product["_id"] = str(product["_id"])
    return {
        "message": "Product approved." if approval_status == "approved" else "Product rejected.",
        "product": product,
    }


@router.get("/disputes")
async def get_disputes(current_admin: str = Depends(admin_only)):
    disputes = []
    async for order in database.orders.find({"dispute": {"$exists": True}}).sort(
        "dispute.opened_at", -1
    ):
        disputes.append(
            {
                "_id": str(order["_id"]),
                "username": order.get("username", ""),
                "order_status": order.get("order_status", ""),
                "payment_status": order.get("payment_status", ""),
                "total_amount": order.get("total_amount", 0),
                "created_at": order.get("created_at"),
                "dispute": order.get("dispute", {}),
            }
        )
    return {"disputes": disputes}


@router.put("/disputes/{order_id}")
async def decide_dispute(
    order_id: str,
    data: DisputeDecision,
    current_admin: str = Depends(admin_only),
):
    try:
        object_id = ObjectId(order_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid order ID")

    order = await database.orders.find_one({"_id": object_id, "dispute": {"$exists": True}})
    if not order:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if order.get("dispute", {}).get("status") not in {"open", "in_review"}:
        raise HTTPException(status_code=409, detail="This dispute is already closed")

    status = "rejected" if data.decision == "reject" else "resolved"
    dispute = {
        **order["dispute"],
        "status": status,
        "decision": data.decision,
        "admin_note": data.note.strip(),
        "resolved_by": current_admin,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }
    updates = {"dispute": dispute}
    if data.decision == "approve_refund":
        updates["payment_status"] = "refund_pending"

    result = await database.orders.update_one(
        {
            "_id": object_id,
            "dispute.status": {"$in": ["open", "in_review"]},
        },
        {"$set": updates},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Dispute changed. Refresh and try again.")

    await create_notification(
        username=order["username"],
        notification_type="dispute_decision",
        title="Dispute reviewed",
        message=(
            "Your refund was approved and is being processed."
            if data.decision == "approve_refund"
            else f"Your dispute was {status}. {data.note.strip()}"
        ),
        link="/my-orders",
        metadata={"order_id": order_id, "decision": data.decision},
    )
    return {
        "message": "Dispute decision saved.",
        "dispute": dispute,
        "payment_status": updates.get("payment_status", order.get("payment_status")),
    }


# --------------------
# DELETE PRODUCT
# --------------------
@router.delete("/delete-product/{product_id}")
async def delete_product(product_id: str, current_admin: str = Depends(admin_only)):
    try:
        object_id = ObjectId(product_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid product ID")

    result = await database.products.delete_one({"_id": object_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    return {
        "message": "Product deleted successfully"
    }


# --------------------
# DELETE USER
# --------------------
@router.delete("/delete-user/{user_id}")
async def delete_user(user_id: str, current_admin: str = Depends(admin_only)):
    try:
        object_id = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    user = await database.users.find_one({"_id": object_id}, {"username": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("username") == current_admin:
        raise HTTPException(status_code=400, detail="You cannot delete your active admin account")

    result = await database.users.delete_one({"_id": object_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "message": "User deleted successfully"
    }
