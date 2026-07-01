import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from jose import jwt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.utils import auth_handler


class AuthGuardTests(unittest.IsolatedAsyncioTestCase):
    def create_token(self, **overrides):
        payload = {
            "sub": "user@example.com",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            **overrides,
        }
        return jwt.encode(payload, auth_handler.SECRET_KEY, algorithm=auth_handler.ALGORITHM)

    def test_verify_token_accepts_valid_token(self):
        token = self.create_token()
        self.assertEqual(auth_handler.verify_token(token), "user@example.com")

    def test_verify_token_rejects_invalid_token(self):
        with self.assertRaises(HTTPException) as context:
            auth_handler.verify_token("invalid-token")

        self.assertEqual(context.exception.status_code, 401)

    def test_verify_token_requires_subject(self):
        token = self.create_token(sub=None)

        with self.assertRaises(HTTPException) as context:
            auth_handler.verify_token(token)

        self.assertEqual(context.exception.status_code, 401)

    async def test_admin_only_allows_admin(self):
        with patch.object(
            auth_handler,
            "get_current_user",
            AsyncMock(return_value={"username": "admin@example.com", "role": "admin"}),
        ):
            username = await auth_handler.admin_only("token")

        self.assertEqual(username, "admin@example.com")

    async def test_admin_only_rejects_customer(self):
        with patch.object(
            auth_handler,
            "get_current_user",
            AsyncMock(return_value={"username": "customer@example.com", "role": "customer"}),
        ):
            with self.assertRaises(HTTPException) as context:
                await auth_handler.admin_only("token")

        self.assertEqual(context.exception.status_code, 403)

    async def test_seller_only_rejects_customer(self):
        with patch.object(
            auth_handler,
            "get_current_user",
            AsyncMock(return_value={"username": "customer@example.com", "role": "customer"}),
        ):
            with self.assertRaises(HTTPException) as context:
                await auth_handler.seller_only("token")

        self.assertEqual(context.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
