import unittest

from app.api.routes.orders import ORDER_TRANSITIONS, get_return_status


class OrderWorkflowTests(unittest.TestCase):
    def test_order_statuses_only_move_forward(self):
        self.assertEqual(ORDER_TRANSITIONS["Processing"], "Packed")
        self.assertEqual(ORDER_TRANSITIONS["Packed"], "Shipped")
        self.assertEqual(ORDER_TRANSITIONS["Shipped"], "Out for delivery")
        self.assertEqual(ORDER_TRANSITIONS["Out for delivery"], "Delivered")

    def test_cancelled_and_delivered_orders_have_no_next_status(self):
        self.assertNotIn("Cancelled", ORDER_TRANSITIONS)
        self.assertNotIn("Delivered", ORDER_TRANSITIONS)

    def test_return_status_stays_requested_while_a_seller_is_pending(self):
        requests = [
            {"status": "approved"},
            {"status": "requested"},
        ]

        self.assertEqual(get_return_status(requests), "requested")

    def test_return_status_supports_partial_approval(self):
        requests = [
            {"status": "approved"},
            {"status": "rejected"},
        ]

        self.assertEqual(get_return_status(requests), "partially_approved")

    def test_return_status_is_approved_when_every_seller_approves(self):
        self.assertEqual(
            get_return_status([{"status": "approved"}, {"status": "approved"}]),
            "approved",
        )


if __name__ == "__main__":
    unittest.main()
