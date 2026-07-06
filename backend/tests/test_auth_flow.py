import unittest
from pathlib import Path
from types import SimpleNamespace
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.routes import auth
from app.services import otp_service


class AuthFlowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await auth.database.users.delete_many({"username": {"$regex": r"^auth-flow-"}})

    async def asyncTearDown(self):
        await auth.database.users.delete_many({"username": {"$regex": r"^auth-flow-"}})

    def request(self):
        return SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))

    async def test_register_then_login(self):
        email = "auth-flow-user@example.com"
        password = "StrongPass123!"
        user = auth.User(
            username=email,
            password=password,
            role="customer",
            firstName="Auth",
            lastName="Flow",
            phone="9149565748",
            gender="male",
        )

        with patch.object(auth, "registration_requires_verification", return_value=False):
            register_response = await auth.register(user, self.request())

        self.assertEqual(register_response["user"]["email"], email)

        login_response = await auth.login(
            auth.LoginRequest(username=email, password=password),
            self.request(),
        )

        self.assertIn("access_token", login_response)
        self.assertEqual(login_response["user"]["email"], email)

    async def test_otp_verified_user_can_register_then_login(self):
        email = "auth-flow-otp-user@example.com"
        password = "StrongPass123!"
        user = auth.User(
            username=email,
            password=password,
            role="customer",
            firstName="Otp",
            lastName="Flow",
            phone="9149565748",
            gender="male",
        )

        otp = await otp_service.create_otp(email, channel="email", destination=email)
        verified = await otp_service.verify_otp_code(email, otp, channel="email", destination=email)
        self.assertTrue(verified)

        register_response = await auth.register(user, self.request())
        self.assertEqual(register_response["user"]["email"], email)

        login_response = await auth.login(
            auth.LoginRequest(username=email, password=password),
            self.request(),
        )

        self.assertIn("access_token", login_response)
        self.assertEqual(login_response["user"]["email"], email)


if __name__ == "__main__":
    unittest.main()
