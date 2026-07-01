import unittest
from datetime import datetime, timezone

from bson import ObjectId

from app.api.routes.notifications import serialize_notification


class NotificationTests(unittest.TestCase):
    def test_notification_serialization_hides_database_fields(self):
        record = {
            "_id": ObjectId(),
            "username": "customer@example.com",
            "type": "order_status",
            "title": "Order shipped",
            "message": "Your order is on the way.",
            "link": "/my-orders",
            "metadata": {"order_id": "123"},
            "read": False,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc),
        }

        serialized = serialize_notification(record)

        self.assertNotIn("username", serialized)
        self.assertNotIn("expires_at", serialized)
        self.assertEqual(serialized["link"], "/my-orders")
        self.assertFalse(serialized["read"])


if __name__ == "__main__":
    unittest.main()
