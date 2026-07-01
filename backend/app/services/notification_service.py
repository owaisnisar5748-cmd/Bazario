import logging
from datetime import datetime, timedelta, timezone

from app.db.database import database

logger = logging.getLogger("bazario.notifications")
NOTIFICATION_RETENTION_DAYS = 90


async def create_notification(
    username: str,
    notification_type: str,
    title: str,
    message: str,
    link: str = "",
    metadata: dict | None = None,
):
    if not username:
        return
    now = datetime.now(timezone.utc)
    try:
        await database.notifications.insert_one(
            {
                "username": username,
                "type": notification_type,
                "title": title,
                "message": message,
                "link": link,
                "metadata": metadata or {},
                "read": False,
                "created_at": now,
                "expires_at": now + timedelta(days=NOTIFICATION_RETENTION_DAYS),
            }
        )
    except Exception:
        logger.exception("Could not create notification for %s", username)


async def notify_many(usernames, **notification):
    for username in sorted({username for username in usernames if username}):
        await create_notification(username=username, **notification)
