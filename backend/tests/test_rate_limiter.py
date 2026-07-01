import unittest
from pathlib import Path
import sys
from types import SimpleNamespace

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.utils.rate_limiter import SlidingWindowRateLimiter, enforce_rate_limit, limiter


class FakeClock:
    def __init__(self):
        self.now = 0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class RateLimiterTests(unittest.TestCase):
    def tearDown(self):
        limiter.reset()

    def test_blocks_after_limit_and_returns_retry_after(self):
        clock = FakeClock()
        rate_limiter = SlidingWindowRateLimiter(clock=clock)

        self.assertEqual(rate_limiter.check("login:client:user", 2, 60), 0)
        self.assertEqual(rate_limiter.check("login:client:user", 2, 60), 0)
        self.assertEqual(rate_limiter.check("login:client:user", 2, 60), 61)

    def test_allows_requests_after_window_expires(self):
        clock = FakeClock()
        rate_limiter = SlidingWindowRateLimiter(clock=clock)

        rate_limiter.check("otp:client:user", 1, 30)
        self.assertGreater(rate_limiter.check("otp:client:user", 1, 30), 0)

        clock.advance(31)
        self.assertEqual(rate_limiter.check("otp:client:user", 1, 30), 0)

    def test_keeps_scopes_and_identities_separate(self):
        clock = FakeClock()
        rate_limiter = SlidingWindowRateLimiter(clock=clock)

        rate_limiter.check("login:client:first@example.com", 1, 60)

        self.assertEqual(rate_limiter.check("login:client:second@example.com", 1, 60), 0)
        self.assertEqual(rate_limiter.check("otp:client:first@example.com", 1, 60), 0)

    def test_enforce_rate_limit_raises_http_429(self):
        request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
        enforce_rate_limit(request, "test", 1, 60, "USER@example.com")

        with self.assertRaises(HTTPException) as context:
            enforce_rate_limit(request, "test", 1, 60, "user@example.com")

        self.assertEqual(context.exception.status_code, 429)
        self.assertIn("Retry-After", context.exception.headers)


if __name__ == "__main__":
    unittest.main()
