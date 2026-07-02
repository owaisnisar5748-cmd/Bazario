import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config.security import validate_secret_key
from scripts.rotate_secret_key import replace_secret


class SecurityConfigTests(unittest.TestCase):
    def test_accepts_strong_secret(self):
        secret = "a-strong-random-secret-that-is-longer-than-thirty-two-characters"
        self.assertEqual(validate_secret_key(secret), secret)

    def test_rejects_placeholder_secret(self):
        with self.assertRaises(RuntimeError) as context:
            validate_secret_key("replace-with-a-long-random-secret")

        self.assertIn("placeholder", str(context.exception))

    def test_rejects_short_secret(self):
        with self.assertRaises(RuntimeError) as context:
            validate_secret_key("too-short")

        self.assertIn("32 characters", str(context.exception))

    def test_rotation_replaces_existing_key_without_changing_other_lines(self):
        lines = [
            "DATABASE_URL=sqlite:///./bazario.db\n",
            "SECRET_KEY=old-value\n",
            "DATABASE_NAME=bazario\n",
        ]

        result = replace_secret(lines, "new-secure-value")

        self.assertEqual(result[0], lines[0])
        self.assertEqual(result[1], "SECRET_KEY=new-secure-value\n")
        self.assertEqual(result[2], lines[2])

    def test_rotation_adds_key_when_missing(self):
        result = replace_secret(["DATABASE_NAME=bazario\n"], "new-secure-value")
        self.assertEqual(result[-1], "SECRET_KEY=new-secure-value\n")


if __name__ == "__main__":
    unittest.main()
