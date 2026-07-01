import unittest

from app.api.routes.prescriptions import has_valid_file_signature, safe_filename
from app.services.prescription_service import prescription_cart_key, prescription_status


class PrescriptionTests(unittest.TestCase):
    def test_file_signatures_are_checked(self):
        self.assertTrue(has_valid_file_signature("application/pdf", b"%PDF-1.7"))
        self.assertTrue(has_valid_file_signature("image/png", b"\x89PNG\r\n\x1a\n"))
        self.assertFalse(has_valid_file_signature("application/pdf", b"not a pdf"))

    def test_filename_removes_header_characters(self):
        self.assertEqual(
            safe_filename('rx"\r\nContent-Type.html'),
            "rxContent-Type.html",
        )

    def test_prescription_cart_key_only_uses_required_items(self):
        required = {
            "product_id": "medicine",
            "quantity": 1,
            "selected_options": {"packSize": "10 tablets"},
            "requires_prescription": True,
        }
        optional = {
            "product_id": "shirt",
            "quantity": 1,
            "selected_options": {"size": "M"},
            "requires_prescription": False,
        }

        self.assertEqual(
            prescription_cart_key([required, optional]),
            prescription_cart_key([required]),
        )

    def test_overall_status_requires_every_seller_approval(self):
        record = {
            "reviews": [
                {"status": "approved"},
                {"status": "pending"},
            ]
        }
        self.assertEqual(prescription_status(record), "pending")
        record["reviews"][1]["status"] = "approved"
        self.assertEqual(prescription_status(record), "approved")


if __name__ == "__main__":
    unittest.main()
