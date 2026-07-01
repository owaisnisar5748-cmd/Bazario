import argparse
import asyncio
from getpass import getpass
from pathlib import Path
import sys

import bcrypt
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from app.db.database import client, database


def parse_args():
    parser = argparse.ArgumentParser(description="Create or promote a Bazario admin account.")
    parser.add_argument("email", help="Admin email address")
    parser.add_argument("--first-name", default="Bazario", help="Admin first name")
    parser.add_argument("--last-name", default="Admin", help="Admin last name")
    return parser.parse_args()


async def create_admin():
    args = parse_args()
    email = args.email.strip().lower()
    password = getpass("Admin password (minimum 8 characters): ")

    if "@" not in email:
        raise SystemExit("Enter a valid email address.")
    if len(password) < 8:
        raise SystemExit("Password must be at least 8 characters.")
    if len(password.encode("utf-8")) > 72:
        raise SystemExit("Password is too long.")

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    existing_user = await database.users.find_one({"username": email})

    values = {
        "username": email,
        "password": password_hash,
        "role": "admin",
        "firstName": args.first_name.strip() or "Bazario",
        "lastName": args.last_name.strip() or "Admin",
        "phone": existing_user.get("phone", "") if existing_user else "",
        "gender": existing_user.get("gender", "") if existing_user else "",
    }

    await database.users.update_one(
        {"username": email},
        {"$set": values},
        upsert=True,
    )

    action = "promoted" if existing_user else "created"
    print(f"Admin account {action}: {email}")


if __name__ == "__main__":
    try:
        asyncio.run(create_admin())
    finally:
        client.close()
