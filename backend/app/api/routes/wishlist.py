from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.database import database
from bson import ObjectId
from app.utils.auth_handler import get_current_user

router = APIRouter()


# --------------------
# WISHLIST MODEL
# --------------------
class WishlistItem(BaseModel):
    product_id: str


# --------------------
# ADD TO WISHLIST
# --------------------
@router.post("/add")
async def add_to_wishlist(item: WishlistItem, current_user: dict = Depends(get_current_user)):
    try:
        product_id = ObjectId(item.product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product")

    product = await database.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    username = current_user["username"]
    existing = await database.wishlist.find_one(
        {"username": username, "product_id": item.product_id}
    )
    if existing:
        existing["_id"] = str(existing["_id"])
        return {"message": "Product already in wishlist", "wishlist_item": existing}

    item_dict = {
        "product_id": item.product_id,
        "product_name": product["name"],
        "price": product["price"],
        "image": product.get("image", ""),
        "username": username,
    }

    result = await database.wishlist.insert_one(
        item_dict
    )

    item_dict["_id"] = str(
        result.inserted_id
    )

    return {
        "message": "Added to wishlist",
        "wishlist_item": item_dict
    }


# --------------------
# GET WISHLIST
# --------------------
@router.get("/")
async def get_wishlist(current_user: dict = Depends(get_current_user)):

    wishlist = []

    async for item in database.wishlist.find({"username": current_user["username"]}):

        item["_id"] = str(item["_id"])

        wishlist.append(item)

    return {
        "wishlist": wishlist
    }


# --------------------
# REMOVE FROM WISHLIST
# --------------------
@router.delete("/remove/{item_id}")
async def remove_from_wishlist(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):

    try:
        object_id = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid wishlist item")

    result = await database.wishlist.delete_one(
        {"_id": object_id, "username": current_user["username"]}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Wishlist item not found")

    return {
        "message": "Item removed from wishlist"
    }
