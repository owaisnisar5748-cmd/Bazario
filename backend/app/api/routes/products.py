from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.db.database import database
from fastapi import Depends
from app.utils.auth_handler import seller_only
from fastapi import UploadFile, File
import cloudinary.uploader
from app.utils.cloudinary_config import *
from bson import ObjectId
from datetime import datetime, timezone
from typing import Literal
router = APIRouter()


class ProductVariant(BaseModel):
    size: str = Field(default="", max_length=20)
    color: str = Field(default="", max_length=40)
    options: dict[str, str] = Field(default_factory=dict)
    stock: int = Field(ge=0)


# --------------------
# PRODUCT MODEL
# --------------------
class Product(BaseModel):

    name: str = Field(min_length=1)

    price: float = Field(gt=0)

    description: str = Field(min_length=1)

    category: Literal["clothes", "electronics", "cosmetics", "medicines"]
    image: str = ""
    images: list[str] = Field(default_factory=list)
    stock: int = Field(ge=0)
    details: dict[str, str] = Field(default_factory=dict)
    variants: list[ProductVariant] = Field(default_factory=list)


class StockUpdate(BaseModel):
    stock: int = Field(ge=0)


class VariantStockUpdate(BaseModel):
    options: dict[str, str] = Field(default_factory=dict)
    size: str = Field(default="", max_length=20)
    color: str = Field(default="", max_length=40)
    stock: int = Field(ge=0)


VARIANT_DIMENSIONS = {
    "clothes": ("size", "colour"),
    "electronics": ("colour", "configuration"),
    "cosmetics": ("shade", "volume"),
    "medicines": ("packSize",),
}


def normalize_variant_options(category: str, variant: dict):
    options = {
        str(key).strip(): str(value).strip()
        for key, value in (variant.get("options") or {}).items()
        if str(key).strip() and str(value).strip()
    }
    if not options and category == "clothes":
        options = {
            "size": str(variant.get("size", "")).strip(),
            "colour": str(variant.get("color", "")).strip(),
        }
    dimensions = VARIANT_DIMENSIONS[category]
    if any(not options.get(dimension) for dimension in dimensions):
        labels = ", ".join(dimensions)
        raise HTTPException(
            status_code=400,
            detail=f"Each {category} variant requires: {labels}",
        )
    return {dimension: options[dimension] for dimension in dimensions}


def variant_key(options: dict[str, str]):
    return "|".join(
        f"{key.lower()}={value.strip().lower()}"
        for key, value in sorted(options.items())
    )


def normalize_product_payload(product: Product):
    product_dict = product.model_dump()
    product_dict["images"] = [image for image in product_dict.get("images", []) if image]
    if not product_dict.get("image") and product_dict["images"]:
        product_dict["image"] = product_dict["images"][0]
    if product_dict["category"] == "medicines":
        prescription = product_dict.get("details", {}).get("prescriptionRequired", "")
        if prescription.strip().lower() not in {"yes", "no"}:
            raise HTTPException(
                status_code=400,
                detail="Prescription required must be Yes or No",
            )

    normalized_variants = []
    variant_keys = set()
    for variant in product_dict.get("variants", []):
        options = normalize_variant_options(product_dict["category"], variant)
        normalized = {
            "options": options,
            "stock": int(variant.get("stock", 0)),
        }
        if product_dict["category"] == "clothes":
            normalized["size"] = options["size"]
            normalized["color"] = options["colour"]
        key = variant_key(options)
        if key in variant_keys:
            raise HTTPException(status_code=400, detail="Product variants must be unique")
        variant_keys.add(key)
        normalized_variants.append(normalized)

    if normalized_variants:
        product_dict["stock"] = sum(variant["stock"] for variant in normalized_variants)
    product_dict["variants"] = normalized_variants
    return product_dict


def is_public_product(product: dict):
    return product.get("approval_status", "approved") == "approved"


async def require_seller_onboarding(current_seller: str):
    seller = await database.users.find_one({"username": current_seller, "role": "seller"})
    onboarding = seller.get("seller_onboarding", {}) if seller else {}
    required = [
        onboarding.get("store_name"),
        onboarding.get("business_phone"),
        onboarding.get("pickup_address"),
        onboarding.get("payout_name"),
    ]
    payout_ready = bool(
        onboarding.get("payout_upi")
        or (onboarding.get("bank_account") and onboarding.get("bank_ifsc"))
    )
    if not all(str(value or "").strip() for value in required) or not payout_ready:
        raise HTTPException(
            status_code=403,
            detail="Complete seller onboarding before adding products",
        )


# --------------------
# ADD PRODUCT
# --------------------
@router.post("/add")
async def add_product(
    product: Product,
    current_seller: str = Depends(seller_only)
):
    await require_seller_onboarding(current_seller)
    product_dict = normalize_product_payload(product)
    product_dict["seller"] = current_seller
    product_dict["approval_status"] = "approved"
    product_dict["approval_note"] = "Auto-approved while admin moderation is disabled."
    product_dict["submitted_at"] = datetime.now(timezone.utc).isoformat()
    product_dict["approved_at"] = datetime.now(timezone.utc).isoformat()

    result = await database.products.insert_one(product_dict)

    product_dict["_id"] = str(result.inserted_id)

    return {
        "message": "Product added successfully",
        "product": product_dict
    }


@router.put("/{product_id}")
async def update_product(
    product_id: str,
    product: Product,
    current_seller: str = Depends(seller_only),
):
    await require_seller_onboarding(current_seller)
    try:
        object_id = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product")

    product_dict = normalize_product_payload(product)
    product_dict.update(
        {
            "approval_status": "approved",
            "approval_note": "Auto-approved while admin moderation is disabled.",
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "reviewed_at": None,
            "reviewed_by": None,
        }
    )
    result = await database.products.update_one(
        {"_id": object_id, "seller": current_seller},
        {"$set": product_dict},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    product_dict["_id"] = product_id
    product_dict["seller"] = current_seller
    return {"message": "Product updated successfully", "product": product_dict}


# --------------------
# GET PRODUCTS
# --------------------
@router.get("/")
async def get_products():

    products = []

    async for product in database.products.find(
        {"approval_status": {"$in": ["approved", None]}}
    ):

        product["_id"] = str(product["_id"])

        products.append(product)

    return {"products": products}

@router.get("/mine")
async def get_seller_products(current_seller: str = Depends(seller_only)):
    products = []

    async for product in database.products.find({"seller": current_seller}):
        product["_id"] = str(product["_id"])
        products.append(product)

    return {"products": products}


@router.put("/{product_id}/stock")
async def update_product_stock(
    product_id: str,
    update: StockUpdate,
    current_seller: str = Depends(seller_only)
):
    try:
        object_id = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product")

    product = await database.products.find_one(
        {"_id": object_id, "seller": current_seller}
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.get("variants"):
        raise HTTPException(
            status_code=409,
            detail="Update stock for each product variant",
        )

    result = await database.products.update_one(
        {"_id": object_id, "seller": current_seller},
        {"$set": {"stock": update.stock}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    return {"message": "Stock updated", "stock": update.stock}


@router.put("/{product_id}/variant-stock")
async def update_variant_stock(
    product_id: str,
    update: VariantStockUpdate,
    current_seller: str = Depends(seller_only),
):
    try:
        object_id = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product")

    product = await database.products.find_one(
        {"_id": object_id, "seller": current_seller}
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    requested_options = {
        key: value.strip()
        for key, value in update.options.items()
        if value.strip()
    }
    if not requested_options and update.size and update.color:
        requested_options = {"size": update.size.strip(), "colour": update.color.strip()}
    requested_key = variant_key(requested_options)
    matched_variant = next(
        (
            variant
            for variant in product.get("variants", [])
            if variant_key(
                variant.get("options")
                or {
                    "size": variant.get("size", ""),
                    "colour": variant.get("color", ""),
                }
            )
            == requested_key
        ),
        None,
    )
    if not matched_variant:
        raise HTTPException(status_code=404, detail="Product variant not found")

    old_stock = int(matched_variant.get("stock", 0))
    matched_options = matched_variant.get("options", requested_options)
    option_match = {
        f"options.{key}": value
        for key, value in matched_options.items()
    }
    array_option_match = {
        f"variant.options.{key}": value
        for key, value in matched_options.items()
    }
    result = await database.products.update_one(
        {
            "_id": object_id,
            "seller": current_seller,
            "variants": {
                "$elemMatch": option_match
            },
        },
        {
            "$set": {"variants.$[variant].stock": update.stock},
            "$inc": {"stock": update.stock - old_stock},
        },
        array_filters=[
            array_option_match
        ],
    )
    if result.modified_count == 0 and old_stock != update.stock:
        raise HTTPException(status_code=409, detail="Variant stock could not be updated")

    return {
        "message": "Variant stock updated",
        "options": matched_options,
        "stock": update.stock,
        "total_stock": int(product.get("stock", 0)) + update.stock - old_stock,
    }


@router.delete("/{product_id}")
async def delete_seller_product(
    product_id: str,
    current_seller: str = Depends(seller_only),
):
    try:
        object_id = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product")

    result = await database.products.delete_one(
        {"_id": object_id, "seller": current_seller}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    await database.cart.delete_many({"product_id": product_id})
    await database.wishlist.delete_many({"product_id": product_id})
    return {"message": "Product removed from the marketplace"}


# --------------------
# SEARCH PRODUCTS
# --------------------
@router.get("/search/")
async def search_products(query: str):

    products = []

    async for product in database.products.find(
        {
            "approval_status": {"$in": ["approved", None]},
            "name": {
                "$regex": query,
                "$options": "i"
            }
        }
    ):

        product["_id"] = str(product["_id"])

        products.append(product)

    return {
        "products": products
    }

# --------------------
# UPLOAD PRODUCT IMAGE
# --------------------
@router.post("/upload-image")
async def upload_product_image(
    file: UploadFile = File(...),
    current_seller: str = Depends(seller_only)
):
    await require_seller_onboarding(current_seller)

    result = cloudinary.uploader.upload(
        file.file
    )

    return {
        "image_url": result["secure_url"]
    }


# --------------------
# FILTER BY CATEGORY
# --------------------
@router.get("/category/")
async def filter_by_category(
    category: Literal["clothes", "electronics", "cosmetics", "medicines"]
):

    products = []

    async for product in database.products.find(
        {
            "approval_status": {"$in": ["approved", None]},
            "category": category
        }
    ):

        product["_id"] = str(product["_id"])

        products.append(product)

    return {
        "products": products
    }


@router.get("/{product_id}")
async def get_product(product_id: str):
    try:
        object_id = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product")

    product = await database.products.find_one({"_id": object_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not is_public_product(product):
        raise HTTPException(status_code=404, detail="Product is not live in the marketplace")

    product["_id"] = str(product["_id"])
    return {"product": product}
