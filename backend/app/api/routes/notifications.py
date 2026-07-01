from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.database import database
from app.utils.auth_handler import get_current_user

router = APIRouter()


def serialize_notification(record):
    return {
        "_id": str(record["_id"]),
        "type": record.get("type", "general"),
        "title": record.get("title", "Bazario update"),
        "message": record.get("message", ""),
        "link": record.get("link", ""),
        "metadata": record.get("metadata", {}),
        "read": bool(record.get("read", False)),
        "created_at": record.get("created_at"),
    }


@router.get("/")
async def get_notifications(
    limit: int = Query(default=20, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    username = current_user["username"]
    notifications = []
    async for record in database.notifications.find(
        {"username": username}
    ).sort("created_at", -1).limit(limit):
        notifications.append(serialize_notification(record))

    unread_count = await database.notifications.count_documents(
        {"username": username, "read": False}
    )
    return {
        "notifications": notifications,
        "unread_count": unread_count,
    }


@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        object_id = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification")

    result = await database.notifications.update_one(
        {"_id": object_id, "username": current_user["username"]},
        {"$set": {"read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}


@router.put("/read-all")
async def mark_all_notifications_read(
    current_user: dict = Depends(get_current_user),
):
    result = await database.notifications.update_many(
        {"username": current_user["username"], "read": False},
        {"$set": {"read": True}},
    )
    return {
        "message": "All notifications marked as read",
        "updated": result.modified_count,
    }
