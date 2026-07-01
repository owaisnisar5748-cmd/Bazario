from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.db.database import database
from app.services.notification_service import create_notification
from app.utils.auth_handler import get_current_user, seller_only
from bson import ObjectId
from datetime import datetime, timezone

router = APIRouter()


# --------------------
# REVIEW MODEL
# --------------------
class Review(BaseModel):
    product_id: str
    rating: int = Field(ge=1, le=5)
    title: str = Field(default="", max_length=90)
    review: str = Field(min_length=3, max_length=1000)


class SellerReply(BaseModel):
    message: str = Field(min_length=2, max_length=700)


# --------------------
# ADD REVIEW
# --------------------
@router.post("/add")
async def add_review(review: Review, current_user: dict = Depends(get_current_user)):
    try:
        product_id = ObjectId(review.product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product")

    product = await database.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    username = current_user["username"]
    purchase = await database.orders.find_one(
        {
            "username": username,
            "order_status": "Delivered",
            "products.product_id": review.product_id,
        }
    )
    if not purchase:
        raise HTTPException(status_code=403, detail="Only customers with a delivered order can review this product")

    purchased_item = next(
        (
            item
            for item in purchase.get("products", [])
            if item.get("product_id") == review.product_id
        ),
        {},
    )

    review_dict = {
        "product_id": review.product_id,
        "product_name": product["name"],
        "rating": review.rating,
        "title": review.title.strip(),
        "review": review.review.strip(),
        "username": username,
        "buyer_name": " ".join(
            part for part in [current_user.get("firstName"), current_user.get("lastName")] if part
        ).strip(),
        "seller": product.get("seller", ""),
        "verified_purchase": True,
        "order_id": str(purchase["_id"]),
        "selected_options": purchased_item.get("selected_options", {}),
        "selected_size": purchased_item.get("selected_size", ""),
        "selected_color": purchased_item.get("selected_color", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    existing = await database.reviews.find_one(
        {"username": username, "product_id": review.product_id}
    )

    if existing:
        await database.reviews.update_one({"_id": existing["_id"]}, {"$set": review_dict})
        review_dict["_id"] = str(existing["_id"])
        review_dict["created_at"] = existing.get("created_at", review_dict["updated_at"])
        if existing.get("seller_reply"):
            review_dict["seller_reply"] = existing["seller_reply"]
        return {"message": "Review updated successfully", "review": review_dict}

    review_dict["created_at"] = review_dict["updated_at"]
    result = await database.reviews.insert_one(review_dict)
    review_dict["_id"] = str(result.inserted_id)
    if product.get("seller"):
        await create_notification(
            username=product["seller"],
            notification_type="product_review",
            title="New verified review",
            message=f"{product['name']} received a {review.rating}-star review.",
            link="/seller-dashboard",
            metadata={"product_id": review.product_id, "review_id": review_dict["_id"]},
        )
    return {"message": "Review added successfully", "review": review_dict}


@router.put("/{review_id}/seller-reply")
async def reply_to_review(
    review_id: str,
    reply: SellerReply,
    current_seller: str = Depends(seller_only),
):
    try:
        object_id = ObjectId(review_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid review")

    existing = await database.reviews.find_one({"_id": object_id, "seller": current_seller})
    if not existing:
        raise HTTPException(status_code=404, detail="Review not found")

    seller_reply = {
        "seller": current_seller,
        "message": reply.message.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await database.reviews.update_one(
        {"_id": object_id, "seller": current_seller},
        {"$set": {"seller_reply": seller_reply}},
    )
    await create_notification(
        username=existing["username"],
        notification_type="review_reply",
        title="Seller replied to your review",
        message=f"The seller replied to your review for {existing.get('product_name', 'a product')}.",
        link=f"/products/{existing['product_id']}",
        metadata={"product_id": existing["product_id"], "review_id": review_id},
    )
    return {"message": "Reply published.", "seller_reply": seller_reply}


# --------------------
# GET REVIEWS
# --------------------
@router.get("/")
async def get_reviews(product_id: str | None = None):

    reviews = []
    query = {"product_id": product_id} if product_id else {}

    async for review in database.reviews.find(query):

        review["_id"] = str(review["_id"])

        reviews.append(review)

    return {
        "reviews": reviews
    }
