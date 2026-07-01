# from sqlalchemy import create_engine
# from sqlalchemy.ext.declarative import declarative_base
# from sqlalchemy.orm import sessionmaker

# DATABASE_URL = "sqlite:///./bazario.db"

# engine = create_engine(DATABASE_URL)
# SessionLocal = sessionmaker(bind=engine)
# Base = declarative_base()


# from sqlalchemy import create_engine
# from sqlalchemy.orm import sessionmaker, declarative_base

# # MySQL connection string
# DATABASE_URL = "mysql+pymysql://root:your_password@localhost:3306/bazario"

# engine = create_engine(DATABASE_URL)

# SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base = declarative_base()


# # Dependency
# def get_db():
#     db = SessionLocal()
#     try:
#         yield db
#     finally:
#         db.close()

import os
from pathlib import Path
from urllib.parse import quote_plus
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

mongo_host = os.getenv("MONGODB_HOST", "localhost")
mongo_username = os.getenv("MONGO_INITDB_ROOT_USERNAME", "").strip()
mongo_password = os.getenv("MONGO_INITDB_ROOT_PASSWORD", "").strip()
default_mongo_url = (
    f"mongodb://{quote_plus(mongo_username)}:{quote_plus(mongo_password)}@"
    f"{mongo_host}:27017/?authSource=admin"
    if mongo_username and mongo_password
    else f"mongodb://{mongo_host}:27017"
)
MONGO_URL = os.getenv("MONGODB_URL", "").strip() or default_mongo_url
DATABASE_NAME = os.getenv("DATABASE_NAME", "bazario_db")

client = AsyncIOMotorClient(
    MONGO_URL,
    serverSelectionTimeoutMS=4000,
    connectTimeoutMS=4000,
    socketTimeoutMS=4000,
)
database = client[DATABASE_NAME]
