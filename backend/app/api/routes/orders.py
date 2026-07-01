from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from app.db.database import database
from datetime import datetime, timedelta, timezone
import asyncio
import html
from bson import ObjectId
from app.utils.auth_handler import get_current_user, seller_only
from typing import Literal
from app.api.routes.cart import get_product_variant, get_variant_options
from app.services.notification_service import create_notification, notify_many

router = APIRouter()
ORDER_TRANSITIONS = {
    "Processing": "Packed",
    "Packed": "Shipped",
    "Shipped": "Out for delivery",
    "Out for delivery": "Delivered",
}
ORDER_STATUS_RANK = {
    "Processing": 0,
    "Packed": 1,
    "Shipped": 2,
    "Out for delivery": 3,
    "Delivered": 4,
}
ORDER_STATUS_LABELS = {
    "Processing": "Order confirmed",
    "Packed": "Order packed",
    "Shipped": "Shipment is on the way",
    "Out for delivery": "Out for delivery",
    "Delivered": "Order delivered",
}
RETURN_WINDOW_DAYS = 7


# --------------------
# ORDER MODEL
# --------------------
class Order(BaseModel):
    address_id: str
    payment_method: Literal["cod"]


class ReturnRequest(BaseModel):
    product_keys: list[str] = Field(min_length=1)
    reason_category: Literal["damaged", "wrong_item", "quality", "size_fit", "changed_mind", "other"]
    reason: str = Field(min_length=10, max_length=500)


class ReturnDecision(BaseModel):
    decision: Literal["approve", "reject"]
    note: str = Field(min_length=3, max_length=500)


class ShipmentUpdate(BaseModel):
    carrier: str = Field(min_length=2, max_length=80)
    tracking_number: str = Field(min_length=3, max_length=100)
    estimated_delivery: str = Field(min_length=10, max_length=40)


class DisputeRequest(BaseModel):
    category: Literal["delivery", "return", "refund", "product", "other"]
    reason: str = Field(min_length=15, max_length=1000)


def parse_datetime(value):
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def get_return_status(return_requests):
    statuses = [request.get("status") for request in return_requests]
    if not statuses:
        return None
    if any(status == "requested" for status in statuses):
        return "requested"
    if all(status == "approved" for status in statuses):
        return "approved"
    if all(status == "rejected" for status in statuses):
        return "rejected"
    return "partially_approved"


def order_product_key(product: dict):
    option_bits = [
        f"{key}:{value}"
        for key, value in sorted((product.get("selected_options") or {}).items())
        if value
    ]
    if not option_bits:
        option_bits = [
            f"size:{product.get('selected_size', '')}",
            f"color:{product.get('selected_color', '')}",
        ]
    option_text = "|".join(option_bits)
    return f"{product.get('product_id', '')}::{option_text}"


def serialize_order(order):
    order["_id"] = str(order["_id"])
    return order


def order_reference(order_id):
    return str(order_id)[-8:].upper()


def seller_order_status(order: dict, seller: str):
    fulfillment = next(
        (
            item
            for item in order.get("seller_fulfillments", [])
            if item.get("seller") == seller
        ),
        None,
    )
    return fulfillment.get("status", order.get("order_status", "Processing")) if fulfillment else order.get("order_status", "Processing")


def seller_order_items(order: dict, seller: str):
    return [
        product for product in order.get("products", [])
        if product.get("seller") == seller
    ]


def seller_items_total(items: list[dict]):
    return round(
        sum(float(item.get("price", 0)) * int(item.get("quantity", 0)) for item in items),
        2,
    )


def serialize_seller_order(order: dict, current_seller: str):
    order["_id"] = str(order["_id"])
    order["products"] = [
        product for product in order.get("products", [])
        if product.get("seller") == current_seller
    ]
    order["seller_total"] = seller_items_total(order["products"])
    seller_fulfillment = next(
        (
            fulfillment
            for fulfillment in order.get("seller_fulfillments", [])
            if fulfillment.get("seller") == current_seller
        ),
        None,
    )
    if seller_fulfillment:
        order["order_status"] = seller_fulfillment.get("status", order.get("order_status"))
        order["seller_status_history"] = seller_fulfillment.get("history", [])
        order["seller_fulfillment_updated_at"] = seller_fulfillment.get("updated_at")
    else:
        order["seller_status_history"] = [
            event
            for event in order.get("status_history", [])
            if event.get("status") == order.get("order_status", "Processing")
        ]
    order["shipments"] = [
        shipment
        for shipment in order.get("shipments", [])
        if shipment.get("seller") == current_seller
    ]
    order["seller_return"] = next(
        (
            request
            for request in order.get("return_requests", [])
            if request.get("seller") == current_seller
        ),
        None,
    )
    order.pop("return_requests", None)
    return order


async def get_delivery_address(username: str, address_id: str):
    try:
        object_id = ObjectId(address_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid delivery address")

    address = await database.addresses.find_one(
        {"_id": object_id, "username": username}
    )
    if not address:
        raise HTTPException(status_code=404, detail="Delivery address not found")
    return address


async def get_checkout_items(username: str, enforce_prescription: bool = True):
    cart_items = []
    requested_by_product = {}
    async for item in database.cart.find({"username": username}):
        try:
            product_id = ObjectId(item["product_id"])
        except Exception:
            raise HTTPException(status_code=400, detail="Cart contains an invalid product")

        product = await database.products.find_one({"_id": product_id})
        if not product:
            raise HTTPException(
                status_code=409,
                detail=f"{item['product_name']} is no longer available"
            )
        if product.get("approval_status", "approved") != "approved":
            raise HTTPException(
                status_code=409,
                detail=f"{product['name']} is awaiting marketplace approval"
            )
        if int(product.get("stock", 0)) < int(item["quantity"]):
            raise HTTPException(
                status_code=409,
                detail=f"{product['name']} does not have enough stock"
            )

        selected_size = item.get("selected_size", "")
        selected_color = item.get("selected_color", "")
        selected_options = item.get("selected_options", {})
        selected_variant = get_product_variant(
            product,
            selected_size,
            selected_color,
            selected_options,
        )
        if product.get("variants") and not selected_variant:
            raise HTTPException(
                status_code=409,
                detail=f"Select an available option for {product['name']}",
            )
        if selected_variant and int(selected_variant.get("stock", 0)) < int(item["quantity"]):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Only {selected_variant.get('stock', 0)} item(s) available "
                    "for the selected options"
                ),
            )
        if selected_variant:
            selected_options = get_variant_options(selected_variant)
        if product.get("category") == "clothes":
            available_sizes = [
                size.strip()
                for size in str(product.get("details", {}).get("sizeRange", "")).split(",")
                if size.strip()
            ]
            if available_sizes and selected_size not in available_sizes:
                raise HTTPException(
                    status_code=409,
                    detail=f"Select an available size for {product['name']}",
                )

        requested_by_product[item["product_id"]] = (
            requested_by_product.get(item["product_id"], 0) + int(item["quantity"])
        )
        if requested_by_product[item["product_id"]] > int(product.get("stock", 0)):
            raise HTTPException(
                status_code=409,
                detail=f"{product['name']} does not have enough stock",
            )

        cart_items.append({
            "product_id": item["product_id"],
            "name": product["name"],
            "quantity": int(item["quantity"]),
            "price": float(product["price"]),
            "seller": product["seller"],
            "image": product.get("image", ""),
            "selected_size": selected_size,
            "selected_color": selected_color,
            "selected_options": selected_options,
            "has_variant_stock": bool(selected_variant),
            "requires_prescription": (
                product.get("category") == "medicines"
                and str(product.get("details", {}).get("prescriptionRequired", "")).strip().lower()
                == "yes"
            ),
        })

    if not cart_items:
        raise HTTPException(status_code=400, detail="Your cart is empty")
    if enforce_prescription:
        from app.services.prescription_service import (
            get_matching_prescription,
            prescription_cart_key,
            prescription_status,
        )

        cart_key = prescription_cart_key(cart_items)
        if cart_key:
            prescription = await get_matching_prescription(username, cart_key)
            status = prescription_status(prescription)
            if status != "approved":
                detail = {
                    "missing": "Upload a prescription before checkout.",
                    "pending": "Your prescription is awaiting seller approval.",
                    "rejected": "Your prescription was rejected. Upload a new valid prescription.",
                }[status]
                raise HTTPException(status_code=409, detail=detail)
    return cart_items


def calculate_order_total(cart_items):
    return round(sum(item["price"] * item["quantity"] for item in cart_items), 2)


async def finalize_order(
    username: str,
    address_id: str,
    payment_method: str,
    payment_status: str,
    payment_details: dict | None = None,
):
    delivery_address = await get_delivery_address(username, address_id)
    cart_items = await get_checkout_items(username)
    reserved_items = []

    for item in cart_items:
        product_id = ObjectId(item["product_id"])
        if item.get("has_variant_stock"):
            selected_options = item["selected_options"]
            option_match = {
                f"options.{key}": value
                for key, value in selected_options.items()
            }
            array_option_match = {
                f"variant.options.{key}": value
                for key, value in selected_options.items()
            }
            result = await database.products.update_one(
                {
                    "_id": product_id,
                    "stock": {"$gte": item["quantity"]},
                    "variants": {
                        "$elemMatch": {
                            **option_match,
                            "stock": {"$gte": item["quantity"]},
                        }
                    },
                },
                {
                    "$inc": {
                        "stock": -item["quantity"],
                        "variants.$[variant].stock": -item["quantity"],
                    }
                },
                array_filters=[
                    {
                        **array_option_match,
                    }
                ],
            )
        else:
            result = await database.products.update_one(
                {"_id": product_id, "stock": {"$gte": item["quantity"]}},
                {"$inc": {"stock": -item["quantity"]}}
            )
        if result.modified_count == 0:
            for reserved in reserved_items:
                await restore_reserved_stock(reserved)
            raise HTTPException(
                status_code=409,
                detail=f"{item['name']} does not have enough stock"
            )
        reserved_items.append(item)

    order_products = [
        {
            key: value for key, value in item.items()
            if key not in {"has_variant_stock", "requires_prescription"}
        }
        for item in cart_items
    ]
    order_dict = {
        "products": order_products,
        "total_amount": calculate_order_total(cart_items),
        "payment_status": payment_status,
        "order_status": "Processing",
        "address_id": address_id,
        "delivery_address": {
            key: delivery_address.get(key, "")
            for key in ("full_name", "phone", "address_line", "city", "state", "pincode")
        },
        "payment_method": payment_method,
        "username": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "estimated_delivery": (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat(),
        "shipments": [],
        "seller_fulfillments": [
            {
                "seller": seller,
                "status": "Processing",
                "history": [
                    {
                        "status": "Processing",
                        "label": "Order confirmed",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                ],
            }
            for seller in sorted({item["seller"] for item in order_products})
        ],
        "status_history": [
            {
                "status": "Processing",
                "label": "Order confirmed",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
    }
    if payment_details:
        order_dict["payment_details"] = payment_details

    try:
        result = await database.orders.insert_one(order_dict)
    except Exception:
        for reserved in reserved_items:
            await restore_reserved_stock(reserved)
        raise

    await database.cart.delete_many({"username": username})
    order_dict["_id"] = str(result.inserted_id)
    await notify_many(
        [item["seller"] for item in order_products],
        notification_type="new_order",
        title="New customer order",
        message=f"Order #{str(result.inserted_id)[-8:].upper()} is ready for fulfilment.",
        link="/seller-orders",
        metadata={"order_id": str(result.inserted_id)},
    )
    return order_dict


async def restore_reserved_stock(item):
    product_id = ObjectId(item["product_id"])
    if item.get("has_variant_stock"):
        selected_options = item["selected_options"]
        array_option_match = {
            f"variant.options.{key}": value
            for key, value in selected_options.items()
        }
        await database.products.update_one(
            {"_id": product_id},
            {
                "$inc": {
                    "stock": item["quantity"],
                    "variants.$[variant].stock": item["quantity"],
                }
            },
            array_filters=[
                array_option_match
            ],
        )
    else:
        await database.products.update_one(
            {"_id": product_id},
            {"$inc": {"stock": item["quantity"]}},
        )


async def restore_order_product_stock(item):
    product_id = ObjectId(item["product_id"])
    selected_options = item.get("selected_options") or {}
    if not selected_options and item.get("selected_size"):
        selected_options = {
            "size": item["selected_size"],
            "colour": item.get("selected_color", ""),
        }

    if selected_options:
        option_match = {
            f"options.{key}": value
            for key, value in selected_options.items()
        }
        array_option_match = {
            f"variant.options.{key}": value
            for key, value in selected_options.items()
        }
        result = await database.products.update_one(
            {
                "_id": product_id,
                "variants": {"$elemMatch": option_match},
            },
            {
                "$inc": {
                    "stock": item["quantity"],
                    "variants.$[variant].stock": item["quantity"],
                }
            },
            array_filters=[array_option_match],
        )
        if result.modified_count:
            return

    await database.products.update_one(
        {"_id": product_id},
        {"$inc": {"stock": item["quantity"]}},
    )


async def reverse_order_stock_restore(item):
    product_id = ObjectId(item["product_id"])
    selected_options = item.get("selected_options") or {}
    if not selected_options and item.get("selected_size"):
        selected_options = {
            "size": item["selected_size"],
            "colour": item.get("selected_color", ""),
        }

    if selected_options:
        option_match = {
            f"options.{key}": value
            for key, value in selected_options.items()
        }
        array_option_match = {
            f"variant.options.{key}": value
            for key, value in selected_options.items()
        }
        result = await database.products.update_one(
            {
                "_id": product_id,
                "variants": {
                    "$elemMatch": {
                        **option_match,
                        "stock": {"$gte": item["quantity"]},
                    }
                },
            },
            {
                "$inc": {
                    "stock": -item["quantity"],
                    "variants.$[variant].stock": -item["quantity"],
                }
            },
            array_filters=[array_option_match],
        )
        if result.modified_count:
            return

    await database.products.update_one(
        {"_id": product_id, "stock": {"$gte": item["quantity"]}},
        {"$inc": {"stock": -item["quantity"]}},
    )


# --------------------
# UPDATE ORDER STATUS
# --------------------
@router.put("/{order_id}/shipment")
async def update_shipment(
    order_id: str,
    shipment: ShipmentUpdate,
    current_seller: str = Depends(seller_only),
):
    try:
        object_id = ObjectId(order_id)
        estimated_delivery = parse_datetime(shipment.estimated_delivery)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid shipment details")

    if estimated_delivery.date() < datetime.now(timezone.utc).date():
        raise HTTPException(status_code=400, detail="Estimated delivery cannot be in the past")

    order = await database.orders.find_one(
        {"_id": object_id, "products.seller": current_seller}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("order_status") not in {"Processing", "Packed", "Shipped"}:
        raise HTTPException(status_code=409, detail="Shipment details cannot be changed for this order")

    shipments = order.get("shipments", [])
    record = {
        "seller": current_seller,
        "carrier": shipment.carrier.strip(),
        "tracking_number": shipment.tracking_number.strip(),
        "estimated_delivery": estimated_delivery.date().isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    existing_index = next(
        (index for index, item in enumerate(shipments) if item.get("seller") == current_seller),
        None,
    )
    if existing_index is None:
        shipments.append(record)
    else:
        shipments[existing_index] = record

    await database.orders.update_one(
        {"_id": object_id, "products.seller": current_seller},
        {"$set": {"shipments": shipments}},
    )
    await create_notification(
        username=order["username"],
        notification_type="shipment_tracking",
        title="Tracking details added",
        message=(
            f"{record['carrier']} tracking {record['tracking_number']} was added "
            f"to order #{order_reference(order_id)}."
        ),
        link="/my-orders",
        metadata={"order_id": order_id, "shipment": record},
    )
    return {"message": "Shipment details saved.", "shipment": record}


@router.put("/update-status/{order_id}")
async def update_order_status(
    order_id: str,
    status: Literal["Processing", "Packed", "Shipped", "Out for delivery", "Delivered"],
    current_seller: str = Depends(seller_only)
):
    try:
        object_id = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order")

    current_order = await database.orders.find_one(
        {"_id": object_id, "products.seller": current_seller}
    )
    if not current_order:
        raise HTTPException(status_code=404, detail="Order not found")
    if status == "Shipped" and not any(
        shipment.get("seller") == current_seller
        and shipment.get("tracking_number")
        for shipment in current_order.get("shipments", [])
    ):
        raise HTTPException(
            status_code=409,
            detail="Add carrier, tracking number, and estimated delivery before shipping.",
        )
    original_fulfillments = current_order.get("seller_fulfillments")
    fulfillments = [dict(item) for item in original_fulfillments] if original_fulfillments else [
        {
            "seller": seller,
            "status": current_order.get("order_status", "Processing"),
        }
        for seller in sorted(
            {
                product.get("seller")
                for product in current_order.get("products", [])
                if product.get("seller")
            }
        )
    ]
    seller_fulfillment = next(
        (item for item in fulfillments if item.get("seller") == current_seller),
        None,
    )
    if not seller_fulfillment:
        raise HTTPException(status_code=404, detail="Seller fulfilment not found")

    expected_status = ORDER_TRANSITIONS.get(seller_fulfillment.get("status"))
    if status != expected_status:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Your fulfilment can only move from {seller_fulfillment.get('status')} "
                f"to {expected_status or 'no further status'}"
            ),
        )

    seller_fulfillment["status"] = status
    seller_fulfillment["updated_at"] = datetime.now(timezone.utc).isoformat()
    seller_fulfillment.setdefault("history", []).append(
        {
            "status": status,
            "label": ORDER_STATUS_LABELS.get(status, status),
            "timestamp": seller_fulfillment["updated_at"],
        }
    )
    fulfillment_statuses = [item.get("status", "Processing") for item in fulfillments]
    aggregate_status = min(
        fulfillment_statuses,
        key=lambda item: ORDER_STATUS_RANK.get(item, 0),
    ) if fulfillment_statuses else "Processing"
    global_status_changed = aggregate_status != current_order.get("order_status")
    update_document = {
        "$set": {
            "seller_fulfillments": fulfillments,
            "order_status": aggregate_status,
            **(
                {"delivered_at": datetime.now(timezone.utc).isoformat()}
                if aggregate_status == "Delivered"
                else {}
            ),
        }
    }
    if global_status_changed:
        update_document["$push"] = {
            "status_history": {
                "status": aggregate_status,
                "label": ORDER_STATUS_LABELS.get(aggregate_status, aggregate_status),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        }

    result = await database.orders.update_one(
        {
            "_id": object_id,
            "products.seller": current_seller,
            "seller_fulfillments": original_fulfillments if original_fulfillments else {"$exists": False},
        },
        update_document,
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Order status changed. Refresh and try again.")

    await create_notification(
        username=current_order["username"],
        notification_type="order_status",
        title=f"Seller shipment {status.lower()}",
        message=(
            f"A shipment in order #{order_id[-8:].upper()} is now {status.lower()}. "
            f"Overall order status: {aggregate_status.lower()}."
        ),
        link="/my-orders",
        metadata={
            "order_id": order_id,
            "seller_status": status,
            "status": aggregate_status,
        },
    )
    return {
        "message": "Order status updated",
        "new_status": status,
        "order_status": aggregate_status,
        "order": serialize_seller_order(
            await database.orders.find_one({"_id": object_id}),
            current_seller,
        ),
    }


@router.get("/{order_id}/invoice")
async def download_invoice(
    order_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        object_id = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order")

    order = await database.orders.find_one(
        {"_id": object_id, "username": current_user["username"]}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    address = None
    try:
        address = await database.addresses.find_one(
            {"_id": ObjectId(order.get("address_id", "")), "username": current_user["username"]}
        )
    except Exception:
        address = None

    rows = "".join(
        (
            "<tr>"
            f"<td>{html.escape(str(item.get('name', 'Product')))}</td>"
            f"<td>{int(item.get('quantity', 0))}</td>"
            f"<td>Rs. {float(item.get('price', 0)):,.2f}</td>"
            f"<td>Rs. {float(item.get('price', 0)) * int(item.get('quantity', 0)):,.2f}</td>"
            "</tr>"
        )
        for item in order.get("products", [])
    )
    invoice_address = order.get("delivery_address") or address or {}
    address_text = html.escape(", ".join(
        str(invoice_address.get(field, "")).strip()
        for field in ("full_name", "phone", "address_line", "city", "state", "pincode")
        if invoice_address.get(field)
    ) or "Saved delivery address")
    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Bazario invoice {order_reference(order_id)}</title>
<style>
body{{font-family:Arial,sans-serif;color:#161711;margin:40px}}h1{{font-family:Georgia,serif}}
.meta{{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:24px 0}}
table{{width:100%;border-collapse:collapse}}th,td{{padding:12px;border-bottom:1px solid #ddd;text-align:left}}
.total{{text-align:right;font-size:20px;font-weight:700;margin-top:24px}}
</style></head><body>
<h1>Bazario invoice</h1>
<p>Order #{order_reference(order_id)}</p>
<div class="meta"><div><strong>Customer</strong><p>{html.escape(current_user["username"])}</p></div>
<div><strong>Delivery address</strong><p>{address_text}</p></div></div>
<table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
<tbody>{rows}</tbody></table>
<p class="total">Order total: Rs. {float(order.get("total_amount", 0)):,.2f}</p>
<p>Payment: {order.get("payment_method", "cod").upper()} / {order.get("payment_status", "pending")}</p>
</body></html>"""
    return Response(
        content=html,
        media_type="text/html",
        headers={
            "Content-Disposition": (
                f'attachment; filename="bazario-invoice-{order_reference(order_id)}.html"'
            )
        },
    )


@router.post("/{order_id}/dispute")
async def open_dispute(
    order_id: str,
    data: DisputeRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        object_id = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order")

    order = await database.orders.find_one(
        {"_id": object_id, "username": current_user["username"]}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("dispute", {}).get("status") in {"open", "in_review"}:
        raise HTTPException(status_code=409, detail="This order already has an active dispute")

    dispute = {
        "status": "open",
        "category": data.category,
        "reason": data.reason.strip(),
        "opened_at": datetime.now(timezone.utc).isoformat(),
        "customer": current_user["username"],
    }
    await database.orders.update_one(
        {"_id": object_id, "username": current_user["username"]},
        {"$set": {"dispute": dispute}},
    )
    admin_usernames = [
        user["username"]
        async for user in database.users.find({"role": "admin"}, {"username": 1})
    ]
    await notify_many(
        admin_usernames,
        notification_type="dispute_opened",
        title="Customer dispute opened",
        message=f"Order #{order_reference(order_id)} needs administrator review.",
        link="/admin-dashboard",
        metadata={"order_id": order_id, "category": data.category},
    )
    order["dispute"] = dispute
    return {"message": "Dispute submitted for administrator review.", "dispute": dispute}


# --------------------
# PLACE ORDER
# --------------------
@router.post("/place")
async def place_order(
    order: Order,
    current_user: dict = Depends(get_current_user)
):
    username = current_user["username"]
    order_dict = await finalize_order(
        username,
        order.address_id,
        payment_method="cod",
        payment_status="pending",
    )

    return {"message": "Order placed successfully", "order": order_dict}


@router.post("/{order_id}/cancel")
async def cancel_order(
    order_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        object_id = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order")

    username = current_user["username"]
    order = await database.orders.find_one(
        {"_id": object_id, "username": username}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("order_status") == "Cancelled":
        order["_id"] = str(order["_id"])
        return {"message": "Order is already cancelled.", "order": order}
    if order.get("order_status") != "Processing":
        raise HTTPException(
            status_code=409,
            detail="Only processing orders can be cancelled.",
        )
    if any(
        fulfillment.get("status") != "Processing"
        for fulfillment in order.get("seller_fulfillments", [])
    ):
        raise HTTPException(
            status_code=409,
            detail="This order can no longer be cancelled because a shipment has already left.",
        )

    claim = await database.orders.update_one(
        {
            "_id": object_id,
            "username": username,
            "order_status": "Processing",
        },
        {"$set": {"order_status": "Cancelling"}},
    )
    if claim.modified_count == 0:
        raise HTTPException(status_code=409, detail="Order status changed. Refresh and try again.")

    restored_items = []
    try:
        for item in order.get("products", []):
            await restore_order_product_stock(item)
            restored_items.append(item)
    except Exception:
        for item in restored_items:
            await reverse_order_stock_restore(item)
        await database.orders.update_one(
            {"_id": object_id},
            {"$set": {"order_status": "Processing"}},
        )
        raise HTTPException(
            status_code=503,
            detail="Could not cancel the order safely. Try again.",
        )

    payment_status = order.get("payment_status", "pending")
    refund_id = None
    if payment_status == "paid" and order.get("payment_details", {}).get("razorpay_payment_id"):
        try:
            from app.api.routes.payment import get_razorpay_client

            client = get_razorpay_client()
            refund = await asyncio.to_thread(
                client.payment.refund,
                order["payment_details"]["razorpay_payment_id"],
                {
                    "amount": int(round(float(order["total_amount"]) * 100)),
                    "notes": {"reason": "Customer cancelled Bazario order"},
                },
            )
            refund_id = refund.get("id")
            payment_status = "refunded"
        except Exception:
            payment_status = "refund_pending"

    updates = {
        "order_status": "Cancelled",
        "payment_status": payment_status,
        "cancelled_at": datetime.now(timezone.utc).isoformat(),
    }
    if refund_id:
        updates["payment_details.refund_id"] = refund_id

    await database.orders.update_one(
        {"_id": object_id, "order_status": "Cancelling"},
        {"$set": updates},
    )
    order["order_status"] = updates["order_status"]
    order["payment_status"] = updates["payment_status"]
    order["cancelled_at"] = updates["cancelled_at"]
    if refund_id:
        order.setdefault("payment_details", {})["refund_id"] = refund_id
    order["_id"] = str(order["_id"])
    message = (
        "Order cancelled. Your refund is being processed."
        if payment_status == "refund_pending"
        else "Order cancelled successfully."
    )
    await notify_many(
        [item.get("seller") for item in order.get("products", [])],
        notification_type="order_cancelled",
        title="Customer cancelled an order",
        message=f"Order #{order_id[-8:].upper()} was cancelled and inventory was restored.",
        link="/seller-orders",
        metadata={"order_id": order_id},
    )
    return {"message": message, "order": order}


@router.post("/{order_id}/return")
async def request_return(
    order_id: str,
    data: ReturnRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        object_id = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order")

    username = current_user["username"]
    order = await database.orders.find_one({"_id": object_id, "username": username})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("order_status") != "Delivered":
        raise HTTPException(status_code=409, detail="Only delivered orders can be returned.")
    existing_return_keys = {
        order_product_key(product)
        for request in order.get("return_requests", [])
        if request.get("status") != "rejected"
        for product in request.get("products", [])
    }
    selected_keys = {key.strip() for key in data.product_keys if key.strip()}
    if not selected_keys:
        raise HTTPException(status_code=400, detail="Select at least one product to return.")
    if selected_keys & existing_return_keys:
        raise HTTPException(status_code=409, detail="One or more selected products already have an active return.")

    delivered_at = parse_datetime(order.get("delivered_at") or order.get("created_at"))
    if datetime.now(timezone.utc) > delivered_at + timedelta(days=RETURN_WINDOW_DAYS):
        raise HTTPException(
            status_code=409,
            detail=f"The {RETURN_WINDOW_DAYS}-day return window has ended.",
        )

    selected_products = [
        product
        for product in order.get("products", [])
        if order_product_key(product) in selected_keys
    ]
    if not selected_products:
        raise HTTPException(status_code=400, detail="Selected return products were not found in this order.")

    products_by_seller = {}
    for product in selected_products:
        products_by_seller.setdefault(product["seller"], []).append(product)

    now = datetime.now(timezone.utc).isoformat()
    new_return_requests = [
        {
            "seller": seller,
            "status": "requested",
            "reason_category": data.reason_category,
            "reason": data.reason.strip(),
            "requested_at": now,
            "products": products,
            "amount": round(
                sum(float(item["price"]) * int(item["quantity"]) for item in products),
                2,
            ),
            "history": [
                {
                    "status": "requested",
                    "label": "Return requested",
                    "timestamp": now,
                }
            ],
        }
        for seller, products in products_by_seller.items()
    ]
    return_requests = [*order.get("return_requests", []), *new_return_requests]
    result = await database.orders.update_one(
        {
            "_id": object_id,
            "username": username,
            "order_status": "Delivered",
        },
        {
            "$set": {
                "return_requests": return_requests,
                "return_status": get_return_status(return_requests),
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Return status changed. Refresh and try again.")

    await notify_many(
        products_by_seller.keys(),
        notification_type="return_requested",
        title="New return request",
        message=f"Review the return request for order #{order_id[-8:].upper()}.",
        link="/seller-orders",
        metadata={"order_id": order_id},
    )
    order["return_requests"] = return_requests
    order["return_status"] = get_return_status(return_requests)
    order["_id"] = str(order["_id"])
    return {"message": "Return request sent to the seller.", "order": order}


@router.put("/{order_id}/returns/decision")
async def decide_return(
    order_id: str,
    data: ReturnDecision,
    current_seller: str = Depends(seller_only),
):
    try:
        object_id = ObjectId(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order")

    order = await database.orders.find_one(
        {
            "_id": object_id,
            "return_requests": {
                "$elemMatch": {
                    "seller": current_seller,
                    "status": "requested",
                }
            },
        }
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pending return request not found")

    claim = await database.orders.update_one(
        {
            "_id": object_id,
            "return_requests": {
                "$elemMatch": {
                    "seller": current_seller,
                    "status": "requested",
                }
            },
        },
        {
            "$set": {"return_requests.$[request].status": "reviewing"},
            "$push": {
                "return_requests.$[request].history": {
                    "status": "reviewing",
                    "label": "Seller is reviewing",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            },
        },
        array_filters=[
            {
                "request.seller": current_seller,
                "request.status": "requested",
            }
        ],
    )
    if claim.modified_count == 0:
        raise HTTPException(status_code=409, detail="Return request is already being reviewed.")

    order = await database.orders.find_one({"_id": object_id})
    seller_return = next(
        request
        for request in order["return_requests"]
        if request["seller"] == current_seller and request["status"] == "reviewing"
    )
    now = datetime.now(timezone.utc).isoformat()

    if data.decision == "reject":
        seller_return.update(
            {
                "status": "rejected",
                "seller_note": data.note.strip(),
                "decided_at": now,
            }
        )
        seller_return.setdefault("history", []).append(
            {
                "status": "rejected",
                "label": "Return rejected",
                "timestamp": now,
            }
        )
    else:
        restored_items = []
        try:
            for item in seller_return["products"]:
                await restore_order_product_stock(item)
                restored_items.append(item)
        except Exception:
            for item in restored_items:
                await reverse_order_stock_restore(item)
            await database.orders.update_one(
                {"_id": object_id},
                {
                    "$set": {
                        "return_requests.$[request].status": "requested",
                    }
                },
                array_filters=[
                    {
                        "request.seller": current_seller,
                        "request.status": "reviewing",
                    }
                ],
            )
            raise HTTPException(
                status_code=503,
                detail="Could not restore returned inventory safely.",
            )

        refund_status = "not_required"
        refund_id = None
        if (
            order.get("payment_status") in {"paid", "partially_refunded"}
            and order.get("payment_details", {}).get("razorpay_payment_id")
        ):
            try:
                from app.api.routes.payment import get_razorpay_client

                client = get_razorpay_client()
                refund = await asyncio.to_thread(
                    client.payment.refund,
                    order["payment_details"]["razorpay_payment_id"],
                    {
                        "amount": int(round(float(seller_return["amount"]) * 100)),
                        "notes": {
                            "reason": "Bazario return approved",
                            "seller": current_seller,
                        },
                    },
                )
                refund_id = refund.get("id")
                refund_status = "refunded"
            except Exception:
                refund_status = "refund_pending"

        seller_return.update(
            {
                "status": "approved",
                "seller_note": data.note.strip(),
                "decided_at": now,
                "refund_status": refund_status,
                "refund_id": refund_id,
            }
        )
        seller_return.setdefault("history", []).append(
            {
                "status": "approved",
                "label": "Return approved",
                "timestamp": now,
            }
        )

    return_status = get_return_status(order["return_requests"])
    approved_requests = [
        request for request in order["return_requests"]
        if request.get("status") == "approved"
    ]
    payment_status = order.get("payment_status", "pending")
    if approved_requests and payment_status in {"paid", "partially_refunded"}:
        if all(request.get("refund_status") == "refunded" for request in approved_requests):
            payment_status = (
                "refunded"
                if len(approved_requests) == len(order["return_requests"])
                else "partially_refunded"
            )
        elif any(request.get("refund_status") == "refund_pending" for request in approved_requests):
            payment_status = "refund_pending"
    elif approved_requests and payment_status == "pending":
        payment_status = "return_completed"

    result = await database.orders.update_one(
        {
            "_id": object_id,
            "return_requests": {
                "$elemMatch": {
                    "seller": current_seller,
                    "status": "reviewing",
                }
            },
        },
        {
            "$set": {
                "return_requests": order["return_requests"],
                "return_status": return_status,
                "payment_status": payment_status,
            }
        },
    )
    if result.modified_count == 0:
        if data.decision == "approve":
            for item in seller_return["products"]:
                await reverse_order_stock_restore(item)
        raise HTTPException(status_code=409, detail="Return status changed. Refresh and try again.")

    await create_notification(
        username=order["username"],
        notification_type="return_decision",
        title=f"Return {data.decision}d" if data.decision == "approve" else "Return rejected",
        message=(
            f"The seller approved your return for order #{order_id[-8:].upper()}."
            if data.decision == "approve"
            else f"The seller rejected your return for order #{order_id[-8:].upper()}."
        ),
        link="/my-orders",
        metadata={
            "order_id": order_id,
            "decision": data.decision,
            "payment_status": payment_status,
        },
    )
    return {
        "message": "Return approved." if data.decision == "approve" else "Return rejected.",
        "return_status": return_status,
        "payment_status": payment_status,
    }


# --------------------
# GET ORDERS
# --------------------
@router.get("/")
async def get_orders(current_user: dict = Depends(get_current_user)):

    orders = []

    async for order in database.orders.find({"username": current_user["username"]}):

        order["_id"] = str(order["_id"])

        orders.append(order)

    return {
        "orders": orders
    }


@router.get("/seller")
async def get_seller_orders(current_seller: str = Depends(seller_only)):
    orders = []

    async for order in database.orders.find({"products.seller": current_seller}):
        orders.append(serialize_seller_order(order, current_seller))

    return {"orders": orders}


@router.get("/seller/earnings")
async def get_seller_earnings(current_seller: str = Depends(seller_only)):
    summary = {
        "gross_sales": 0,
        "delivered_earnings": 0,
        "pending_earnings": 0,
        "deductions": 0,
        "eligible_payout": 0,
        "paid_payouts": 0,
        "orders_count": 0,
        "delivered_orders": 0,
        "pending_orders": 0,
        "cancelled_orders": 0,
        "returned_orders": 0,
    }
    product_sales = {}
    transactions = []

    async for order in database.orders.find({"products.seller": current_seller}):
        items = seller_order_items(order, current_seller)
        if not items:
            continue
        seller_total = seller_items_total(items)
        status = seller_order_status(order, current_seller)
        order_status = order.get("order_status", status)
        seller_return = next(
            (
                request
                for request in order.get("return_requests", [])
                if request.get("seller") == current_seller
            ),
            None,
        )
        returned_amount = float(seller_return.get("amount", 0)) if seller_return and seller_return.get("status") == "approved" else 0
        is_cancelled = order_status == "Cancelled"
        is_delivered = status == "Delivered" and not is_cancelled

        summary["orders_count"] += 1
        if is_cancelled:
            summary["cancelled_orders"] += 1
            summary["deductions"] += seller_total
            payout_status = "cancelled"
        elif is_delivered:
            summary["delivered_orders"] += 1
            summary["gross_sales"] += seller_total
            summary["delivered_earnings"] += max(seller_total - returned_amount, 0)
            payout_status = "eligible"
        else:
            summary["pending_orders"] += 1
            summary["pending_earnings"] += seller_total
            payout_status = "pending"

        if returned_amount:
            summary["returned_orders"] += 1
            summary["deductions"] += returned_amount

        for item in items:
            product_id = item.get("product_id", "")
            current = product_sales.setdefault(
                product_id,
                {
                    "product_id": product_id,
                    "name": item.get("name", "Product"),
                    "units": 0,
                    "revenue": 0,
                    "delivered_units": 0,
                    "pending_units": 0,
                },
            )
            quantity = int(item.get("quantity", 0))
            amount = round(float(item.get("price", 0)) * quantity, 2)
            current["units"] += quantity
            current["revenue"] = round(current["revenue"] + amount, 2)
            if is_delivered:
                current["delivered_units"] += quantity
            elif not is_cancelled:
                current["pending_units"] += quantity

        transactions.append(
            {
                "order_id": str(order["_id"]),
                "reference": order_reference(order["_id"]),
                "created_at": order.get("created_at"),
                "status": status,
                "payment_method": order.get("payment_method", "cod"),
                "payment_status": order.get("payment_status", "pending"),
                "amount": seller_total,
                "deduction": returned_amount if returned_amount else seller_total if is_cancelled else 0,
                "net_amount": 0 if is_cancelled else round(max(seller_total - returned_amount, 0), 2),
                "payout_status": payout_status,
            }
        )

    summary["gross_sales"] = round(summary["gross_sales"], 2)
    summary["delivered_earnings"] = round(summary["delivered_earnings"], 2)
    summary["pending_earnings"] = round(summary["pending_earnings"], 2)
    summary["deductions"] = round(summary["deductions"], 2)
    summary["eligible_payout"] = summary["delivered_earnings"]
    transactions.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    return {
        "summary": summary,
        "product_sales": sorted(
            product_sales.values(),
            key=lambda item: item["revenue"],
            reverse=True,
        ),
        "transactions": transactions[:25],
        "payouts": [
            {
                "label": "Current eligible payout",
                "status": "eligible" if summary["eligible_payout"] > 0 else "pending",
                "amount": summary["eligible_payout"],
                "note": "Estimated from delivered orders after approved returns.",
            },
            {
                "label": "Pending delivery earnings",
                "status": "pending",
                "amount": summary["pending_earnings"],
                "note": "Moves to eligible after orders are delivered.",
            },
        ],
    }
