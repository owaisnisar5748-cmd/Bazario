from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.db.database import database
from app.utils.auth_handler import get_current_user
from bson import ObjectId
from app.api.routes.products import variant_key

router = APIRouter()


# --------------------
# CART MODEL
# --------------------
class CartItem(BaseModel):
    product_id: str
    product_name: str
    price: float
    image: str = ""
    quantity: int = Field(gt=0)
    selected_size: str = Field(default="", max_length=20)
    selected_color: str = Field(default="", max_length=40)
    selected_options: dict[str, str] = Field(default_factory=dict)


class CartQuantity(BaseModel):
    quantity: int = Field(gt=0)


def get_available_sizes(product: dict):
    if product.get("category") != "clothes":
        return []
    size_range = str(product.get("details", {}).get("sizeRange", ""))
    return [size.strip() for size in size_range.split(",") if size.strip()]


def get_variant_options(variant: dict):
    return variant.get("options") or {
        "size": variant.get("size", ""),
        "colour": variant.get("color", ""),
    }


def get_product_variant(
    product: dict,
    selected_size: str = "",
    selected_color: str = "",
    selected_options: dict | None = None,
):
    variants = product.get("variants") or []
    if not variants:
        return None
    options = {
        key: value.strip()
        for key, value in (selected_options or {}).items()
        if value.strip()
    }
    if not options and (selected_size or selected_color):
        options = {"size": selected_size, "colour": selected_color}
    requested_key = variant_key(options)
    return next(
        (
            variant
            for variant in variants
            if variant_key(get_variant_options(variant)) == requested_key
        ),
        None,
    )


# --------------------
# ADD TO CART
# --------------------
@router.post("/add")
async def add_to_cart(
    item: CartItem,
    current_user: dict = Depends(get_current_user)
):
    try:
        product_id = ObjectId(item.product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product")

    product = await database.products.find_one({"_id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.get("approval_status", "approved") != "approved":
        raise HTTPException(status_code=409, detail="This product is awaiting marketplace approval")

    available_sizes = get_available_sizes(product)
    selected_size = item.selected_size.strip()
    if available_sizes:
        size_lookup = {size.lower(): size for size in available_sizes}
        if selected_size.lower() not in size_lookup:
            raise HTTPException(status_code=400, detail="Select an available size")
        selected_size = size_lookup[selected_size.lower()]
    else:
        selected_size = ""

    selected_color = item.selected_color.strip()
    selected_options = {
        key: value.strip()
        for key, value in item.selected_options.items()
        if value.strip()
    }
    variants = product.get("variants") or []
    selected_variant = None
    if variants:
        selected_variant = get_product_variant(
            product,
            selected_size,
            selected_color,
            selected_options,
        )
        if not selected_variant:
            raise HTTPException(
                status_code=400,
                detail="Select an available product option combination",
            )
        selected_options = get_variant_options(selected_variant)
        selected_size = selected_options.get("size", "")
        selected_color = selected_options.get("colour", "")
    else:
        selected_color = ""
        selected_options = {}
    selected_variant_key = variant_key(selected_options)

    username = current_user["username"]
    existing_item = await database.cart.find_one(
        {
            "username": username,
            "product_id": item.product_id,
            "selected_size": selected_size,
            "selected_color": selected_color,
            "selected_variant_key": selected_variant_key,
        }
    )
    quantity_in_cart = 0
    async for cart_item in database.cart.find(
        {
            "username": username,
            "product_id": item.product_id,
            **(
                {
                    "selected_variant_key": selected_variant_key,
                }
                if selected_variant
                else {}
            ),
        }
    ):
        quantity_in_cart += int(cart_item.get("quantity", 0))

    requested_quantity = item.quantity + quantity_in_cart
    available_stock = (
        selected_variant.get("stock", 0)
        if selected_variant
        else product.get("stock", 0)
    )
    if requested_quantity > available_stock:
        raise HTTPException(
            status_code=409,
            detail=f"Only {available_stock} item(s) available"
        )

    if existing_item:
        await database.cart.update_one(
            {"_id": existing_item["_id"]},
            {"$inc": {"quantity": item.quantity}}
        )
        existing_item["quantity"] += item.quantity
        existing_item["_id"] = str(existing_item["_id"])
        return {"message": "Cart quantity updated", "item": existing_item}

    cart_item = {
        "product_id": item.product_id,
        "product_name": product["name"],
        "price": product["price"],
        "image": product.get("image", ""),
        "quantity": item.quantity,
        "selected_size": selected_size,
        "selected_color": selected_color,
        "selected_options": selected_options,
        "selected_variant_key": selected_variant_key,
        "username": username,
    }
    result = await database.cart.insert_one(cart_item)
    cart_item["_id"] = str(result.inserted_id)

    return {"message": "Item added to cart", "item": cart_item}


# --------------------
# GET USER CART
# --------------------
@router.get("/")
async def get_cart(
    current_user: dict = Depends(get_current_user)
):

    cart_items = []

    async for item in database.cart.find(
        {"username": current_user["username"]}
    ):

        item["_id"] = str(item["_id"])

        cart_items.append(item)

    return {
        "cart": cart_items
    }


# --------------------
# REMOVE ITEM
# --------------------
@router.delete("/remove/{item_id}")
async def remove_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        object_id = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cart item")

    result = await database.cart.delete_one(
        {"_id": object_id, "username": current_user["username"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cart item not found")

    return {
        "message": "Item removed from cart"
    }


@router.put("/{item_id}")
async def update_quantity(
    item_id: str,
    update: CartQuantity,
    current_user: dict = Depends(get_current_user)
):
    try:
        object_id = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cart item")

    item = await database.cart.find_one(
        {"_id": object_id, "username": current_user["username"]}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    product = await database.products.find_one({"_id": ObjectId(item["product_id"])})
    if not product:
        raise HTTPException(status_code=409, detail="Product is no longer available")
    selected_variant = get_product_variant(
        product,
        item.get("selected_size", ""),
        item.get("selected_color", ""),
        item.get("selected_options", {}),
    )
    other_variant_quantity = 0
    async for cart_item in database.cart.find(
        {
            "username": current_user["username"],
            "product_id": item["product_id"],
            "_id": {"$ne": object_id},
            **(
                {
                    "selected_variant_key": item.get("selected_variant_key", ""),
                }
                if selected_variant
                else {}
            ),
        }
    ):
        other_variant_quantity += int(cart_item.get("quantity", 0))

    available_stock = (
        selected_variant.get("stock", 0)
        if selected_variant
        else product.get("stock", 0)
    )
    if update.quantity + other_variant_quantity > available_stock:
        raise HTTPException(status_code=409, detail=f"Only {available_stock} item(s) available")

    await database.cart.update_one({"_id": object_id}, {"$set": {"quantity": update.quantity}})
    return {"message": "Cart updated", "quantity": update.quantity}
