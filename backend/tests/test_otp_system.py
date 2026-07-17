import unittest
from datetime import datetime, timezone
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import otp_service


class FakeCollection:
    def __init__(self):
        self.records = {}

    async def find_one(self, query, projection=None):
        record = self.records.get(query["_id"])
        if not record:
            return None
        if projection:
            return {key: record[key] for key in projection if key in record}
        return dict(record)

    async def replace_one(self, query, document, upsert=False):
        self.records[query["_id"]] = dict(document)

    async def delete_one(self, query):
        self.records.pop(query["_id"], None)

    async def update_one(self, query, update):
        if query["_id"] in self.records:
            self.records[query["_id"]].update(update.get("$set", {}))

    async def find_one_and_delete(self, query):
        return self.records.pop(query["_id"], None)


class FakeDatabase:
    def __init__(self):
        self.otp_codes = FakeCollection()
        self.otp_verifications = FakeCollection()


class OTPSystemTests(unittest.IsolatedAsyncioTestCase):
    async def test_otp_is_hashed_and_can_be_consumed_after_verification(self):
        fake_database = FakeDatabase()

        with patch.object(otp_service, "database", fake_database):
            otp = await otp_service.create_otp(
                "user@example.com",
                channel="email",
                destination="user@example.com",
            )
            stored = fake_database.otp_codes.records["registration:user@example.com"]

            self.assertNotIn("otp", stored)
            self.assertNotEqual(stored["otp_hash"], otp)

            verified = await otp_service.verify_otp_code(
                "user@example.com",
                otp,
                channel="email",
                destination="user@example.com",
            )
            verification = await otp_service.consume_verification("user@example.com")

        self.assertTrue(verified)
        self.assertEqual(verification["channel"], "email")
        self.assertEqual(verification["destination"], "user@example.com")

    async def test_wrong_destination_does_not_verify(self):
        fake_database = FakeDatabase()

        with patch.object(otp_service, "database", fake_database):
            otp = await otp_service.create_otp(
                "user@example.com",
                channel="email",
                destination="user@example.com",
            )
            verified = await otp_service.verify_otp_code(
                "user@example.com",
                otp,
                channel="email",
                destination="other@example.com",
            )

        self.assertFalse(verified)

    async def test_expired_otp_is_rejected(self):
        fake_database = FakeDatabase()
        record_id = "registration:user@example.com"
        fake_database.otp_codes.records[record_id] = {
            "_id": record_id,
            "otp_hash": "unused",
            "expires_at": datetime(2020, 1, 1, tzinfo=timezone.utc),
            "attempts": 0,
        }

        with patch.object(otp_service, "database", fake_database):
            verified = await otp_service.verify_otp_code("user@example.com", "123456")

        self.assertFalse(verified)
        self.assertNotIn(record_id, fake_database.otp_codes.records)


if __name__ == "__main__":
    unittest.main()
