import os
import unittest
from unittest.mock import patch

from app.api.routes.payment import (
    cart_signature,
    get_razorpay_setup_message,
    is_razorpay_configured,
)


class PaymentSystemTests(unittest.TestCase):
    def test_placeholder_razorpay_keys_are_not_configured(self):
        with patch.dict(
            os.environ,
            {
                "RAZORPAY_KEY_ID": "your-key-id",
                "RAZORPAY_KEY_SECRET": "your-key-secret",
            },
        ):
            self.assertFalse(is_razorpay_configured())

    def test_valid_razorpay_keys_are_configured(self):
        with patch.dict(
            os.environ,
            {
                "RAZORPAY_KEY_ID": "rzp_test_example",
                "RAZORPAY_KEY_SECRET": "secure-test-secret",
            },
        ):
            self.assertTrue(is_razorpay_configured())

    def test_malformed_razorpay_key_is_not_configured(self):
        with patch.dict(
            os.environ,
            {
                "RAZORPAY_KEY_ID": "rzp_test__example",
                "RAZORPAY_KEY_SECRET": "secure-test-secret",
            },
        ):
            self.assertFalse(is_razorpay_configured())
            self.assertIn("invalid format", get_razorpay_setup_message())

    def test_cart_signature_is_stable_across_item_order(self):
        first = [
            {"product_id": "a", "quantity": 2, "price": 199.0},
            {"product_id": "b", "quantity": 1, "price": 49.5},
        ]
        second = list(reversed(first))

        self.assertEqual(cart_signature(first), cart_signature(second))

    def test_cart_signature_changes_when_quantity_changes(self):
        original = [{"product_id": "a", "quantity": 1, "price": 199.0}]
        changed = [{"product_id": "a", "quantity": 2, "price": 199.0}]

        self.assertNotEqual(cart_signature(original), cart_signature(changed))

    def test_cart_signature_changes_when_size_changes(self):
        small = [
            {
                "product_id": "shirt",
                "selected_size": "S",
                "quantity": 1,
                "price": 1499.0,
            }
        ]
        medium = [{**small[0], "selected_size": "M"}]

        self.assertNotEqual(cart_signature(small), cart_signature(medium))

    def test_cart_signature_changes_when_colour_changes(self):
        navy = [
            {
                "product_id": "shirt",
                "selected_size": "M",
                "selected_color": "Navy",
                "quantity": 1,
                "price": 1499.0,
            }
        ]
        white = [{**navy[0], "selected_color": "White"}]

        self.assertNotEqual(cart_signature(navy), cart_signature(white))


if __name__ == "__main__":
    unittest.main()
