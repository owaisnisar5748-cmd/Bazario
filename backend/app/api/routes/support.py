from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.db.database import database
from app.services.notification_service import create_notification, notify_many
from app.utils.auth_handler import admin_only, get_current_user

router = APIRouter()


class TicketCreate(BaseModel):
    subject: str = Field(min_length=5, max_length=120)
    category: Literal["account", "order", "payment", "return", "seller", "technical", "other"]
    message: str = Field(min_length=15, max_length=2000)
    order_id: str = Field(default="", max_length=24)


class TicketReply(BaseModel):
    message: str = Field(min_length=2, max_length=2000)


class TicketStatus(BaseModel):
    status: Literal["open", "in_progress", "resolved", "closed"]


def serialize_ticket(ticket):
    ticket["_id"] = str(ticket["_id"])
    return ticket


@router.post("/")
async def create_ticket(
    data: TicketCreate,
    current_user: dict = Depends(get_current_user),
):
    if data.order_id:
        try:
            order_id = ObjectId(data.order_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid order reference")
        order = await database.orders.find_one(
            {"_id": order_id, "username": current_user["username"]}
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

    now = datetime.now(timezone.utc)
    ticket = {
        "username": current_user["username"],
        "role": current_user.get("role", "customer"),
        "subject": data.subject.strip(),
        "category": data.category,
        "order_id": data.order_id,
        "status": "open",
        "created_at": now,
        "updated_at": now,
        "messages": [
            {
                "sender": current_user["username"],
                "sender_role": current_user.get("role", "customer"),
                "message": data.message.strip(),
                "created_at": now,
            }
        ],
    }
    result = await database.support_tickets.insert_one(ticket)
    ticket["_id"] = str(result.inserted_id)

    admins = [
        user["username"]
        async for user in database.users.find({"role": "admin"}, {"username": 1})
    ]
    await notify_many(
        admins,
        notification_type="support_ticket",
        title="New support ticket",
        message=f"{ticket['subject']} from {ticket['username']}",
        link="/admin-dashboard",
        metadata={"ticket_id": ticket["_id"]},
    )
    return {"message": "Support ticket created.", "ticket": ticket}


@router.get("/")
async def get_my_tickets(current_user: dict = Depends(get_current_user)):
    tickets = []
    async for ticket in database.support_tickets.find(
        {"username": current_user["username"]}
    ).sort("updated_at", -1):
        tickets.append(serialize_ticket(ticket))
    return {"tickets": tickets}


@router.post("/{ticket_id}/reply")
async def reply_to_ticket(
    ticket_id: str,
    data: TicketReply,
    current_user: dict = Depends(get_current_user),
):
    try:
        object_id = ObjectId(ticket_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid support ticket")

    ticket = await database.support_tickets.find_one(
        {"_id": object_id, "username": current_user["username"]}
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    if ticket.get("status") == "closed":
        raise HTTPException(status_code=409, detail="Closed tickets cannot receive replies")

    now = datetime.now(timezone.utc)
    message = {
        "sender": current_user["username"],
        "sender_role": current_user.get("role", "customer"),
        "message": data.message.strip(),
        "created_at": now,
    }
    await database.support_tickets.update_one(
        {"_id": object_id, "username": current_user["username"]},
        {
            "$push": {"messages": message},
            "$set": {"status": "open", "updated_at": now},
        },
    )
    admins = [
        user["username"]
        async for user in database.users.find({"role": "admin"}, {"username": 1})
    ]
    await notify_many(
        admins,
        notification_type="support_reply",
        title="Customer replied to support",
        message=ticket.get("subject", "Support ticket"),
        link="/admin-dashboard",
        metadata={"ticket_id": ticket_id},
    )
    return {"message": "Reply sent.", "reply": message, "status": "open"}


@router.get("/admin")
async def get_admin_tickets(current_admin: str = Depends(admin_only)):
    tickets = []
    async for ticket in database.support_tickets.find().sort("updated_at", -1):
        tickets.append(serialize_ticket(ticket))
    return {"tickets": tickets}


@router.post("/admin/{ticket_id}/reply")
async def admin_reply(
    ticket_id: str,
    data: TicketReply,
    current_admin: str = Depends(admin_only),
):
    try:
        object_id = ObjectId(ticket_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid support ticket")

    ticket = await database.support_tickets.find_one({"_id": object_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")

    now = datetime.now(timezone.utc)
    message = {
        "sender": current_admin,
        "sender_role": "admin",
        "message": data.message.strip(),
        "created_at": now,
    }
    await database.support_tickets.update_one(
        {"_id": object_id},
        {
            "$push": {"messages": message},
            "$set": {"status": "in_progress", "updated_at": now},
        },
    )
    await create_notification(
        username=ticket["username"],
        notification_type="support_reply",
        title="Bazario support replied",
        message=ticket.get("subject", "Your support ticket"),
        link="/support",
        metadata={"ticket_id": ticket_id},
    )
    return {"message": "Reply sent.", "reply": message, "status": "in_progress"}


@router.put("/admin/{ticket_id}/status")
async def update_ticket_status(
    ticket_id: str,
    data: TicketStatus,
    current_admin: str = Depends(admin_only),
):
    try:
        object_id = ObjectId(ticket_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid support ticket")

    ticket = await database.support_tickets.find_one({"_id": object_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    now = datetime.now(timezone.utc)
    await database.support_tickets.update_one(
        {"_id": object_id},
        {
            "$set": {
                "status": data.status,
                "updated_at": now,
                "closed_at": now if data.status == "closed" else None,
            }
        },
    )
    await create_notification(
        username=ticket["username"],
        notification_type="support_status",
        title="Support ticket updated",
        message=f"{ticket.get('subject', 'Ticket')} is now {data.status.replace('_', ' ')}.",
        link="/support",
        metadata={"ticket_id": ticket_id, "status": data.status},
    )
    return {"message": "Ticket status updated.", "status": data.status}
