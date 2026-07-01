import unittest
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.routes import admin


class AsyncCursor:
    def __init__(self, items):
        self._items = items

    def __aiter__(self):
        self._iterator = iter(self._items)
        return self

    async def __anext__(self):
        try:
            return next(self._iterator)
        except StopIteration as error:
            raise StopAsyncIteration from error


class FakeCollection:
    def __init__(self, items=None, delete_count=1):
        self.items = items or []
        self.delete_count = delete_count
        self.deleted_filter = None

    def find(self):
        return AsyncCursor([dict(item) for item in self.items])

    async def find_one(self, query, projection=None):
        object_id = query.get("_id")
        for item in self.items:
            if item.get("_id") == object_id:
                if projection:
                    return {key: item[key] for key in projection if key in item}
                return dict(item)
        return None

    async def delete_one(self, query):
        self.deleted_filter = query
        return SimpleNamespace(deleted_count=self.delete_count)


class AdminRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_users_removes_passwords(self):
        user_id = ObjectId()
        fake_database = SimpleNamespace(
            users=FakeCollection([
                {
                    "_id": user_id,
                    "username": "customer@example.com",
                    "password": "secret-hash",
                    "role": "customer",
                }
            ])
        )

        with patch.object(admin, "database", fake_database):
            response = await admin.get_users(current_admin="admin@example.com")

        self.assertEqual(response["users"][0]["_id"], str(user_id))
        self.assertNotIn("password", response["users"][0])

    async def test_delete_product_rejects_invalid_id(self):
        with self.assertRaises(HTTPException) as context:
            await admin.delete_product("not-an-object-id", current_admin="admin@example.com")

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail, "Invalid product ID")

    async def test_delete_product_returns_not_found(self):
        fake_database = SimpleNamespace(products=FakeCollection(delete_count=0))

        with patch.object(admin, "database", fake_database):
            with self.assertRaises(HTTPException) as context:
                await admin.delete_product(str(ObjectId()), current_admin="admin@example.com")

        self.assertEqual(context.exception.status_code, 404)

    async def test_delete_user_blocks_current_admin(self):
        admin_id = ObjectId()
        users = FakeCollection([
            {"_id": admin_id, "username": "admin@example.com", "role": "admin"}
        ])
        fake_database = SimpleNamespace(users=users)

        with patch.object(admin, "database", fake_database):
            with self.assertRaises(HTTPException) as context:
                await admin.delete_user(str(admin_id), current_admin="admin@example.com")

        self.assertEqual(context.exception.status_code, 400)
        self.assertIsNone(users.deleted_filter)

    async def test_delete_user_removes_other_account(self):
        user_id = ObjectId()
        users = FakeCollection([
            {"_id": user_id, "username": "seller@example.com", "role": "seller"}
        ])
        fake_database = SimpleNamespace(users=users)

        with patch.object(admin, "database", fake_database):
            response = await admin.delete_user(str(user_id), current_admin="admin@example.com")

        self.assertEqual(response["message"], "User deleted successfully")
        self.assertEqual(users.deleted_filter, {"_id": user_id})


if __name__ == "__main__":
    unittest.main()
