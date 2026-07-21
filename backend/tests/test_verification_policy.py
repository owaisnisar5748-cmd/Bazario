import importlib
import os
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import verification_policy


class VerificationPolicyTests(unittest.TestCase):
    def reload_policy(self, **env):
        original = os.environ.copy()
        os.environ.update(env)
        self.addCleanup(self.restore_policy, original)
        return importlib.reload(verification_policy)

    def restore_policy(self, original):
        os.environ.clear()
        os.environ.update(original)
        importlib.reload(verification_policy)

    def test_production_ignores_development_otp_codes(self):
        policy = self.reload_policy(APP_ENV="production", OTP_ALLOW_DEV_CODE="true")
        self.assertFalse(policy.OTP_ALLOW_DEV_CODE)

    def test_production_auto_does_not_require_registration_verification(self):
        policy = self.reload_policy(APP_ENV="production", REGISTRATION_REQUIRE_VERIFICATION="auto")
        self.assertFalse(policy.registration_requires_verification())

    def test_development_auto_does_not_require_registration_verification(self):
        policy = self.reload_policy(APP_ENV="development", REGISTRATION_REQUIRE_VERIFICATION="auto")
        self.assertFalse(policy.registration_requires_verification())


if __name__ == "__main__":
    unittest.main()
