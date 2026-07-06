import copy
import json
import os
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse

from bson import ObjectId
from dotenv import load_dotenv

try:
    import pymysql
except ImportError:
    pymysql = None


BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")


class DatabaseError(Exception):
    pass


def _database_path() -> Path:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    default_url = "sqlite:////data/bazario.db" if app_env == "production" else "sqlite:///./bazario.db"
    raw_url = os.getenv("DATABASE_URL") or os.getenv("SQL_DATABASE_URL") or default_url
    if raw_url.startswith("sqlite:///"):
        path = raw_url.replace("sqlite:///", "", 1)
    else:
        parsed = urlparse(raw_url)
        path = parsed.path or "./bazario.db"
    db_path = Path(path)
    if not db_path.is_absolute():
        db_path = BACKEND_DIR / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path


def _database_url() -> str:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    default_url = "sqlite:////data/bazario.db" if app_env == "production" else "sqlite:///./bazario.db"
    return (
        os.getenv("DATABASE_URL")
        or os.getenv("SQL_DATABASE_URL")
        or default_url
    )


def _mysql_config(raw_url: str):
    parsed = urlparse(raw_url)
    database_name = parsed.path.lstrip("/") or os.getenv("MYSQLDATABASE") or "bazario"
    return {
        "host": parsed.hostname or os.getenv("MYSQLHOST", "localhost"),
        "port": parsed.port or int(os.getenv("MYSQLPORT", "3306")),
        "user": parsed.username or os.getenv("MYSQLUSER", "root"),
        "password": parsed.password or os.getenv("MYSQLPASSWORD", ""),
        "database": database_name,
        "charset": "utf8mb4",
        "autocommit": False,
    }


def _json_default(value):
    if isinstance(value, datetime):
        return {"__datetime__": value.isoformat()}
    if isinstance(value, bytes):
        return {"__bytes__": value.hex()}
    return str(value)


def _json_object_hook(value):
    if "__datetime__" in value:
        return datetime.fromisoformat(value["__datetime__"])
    if "__bytes__" in value:
        return bytes.fromhex(value["__bytes__"])
    return value


def _normalize(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {key: _normalize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    return value


def _get_value(document, dotted_key):
    return _get_parts(document, dotted_key.split("."))


def _get_parts(current, parts):
    if not parts:
        return current
    part = parts[0]
    remaining = parts[1:]
    if isinstance(current, list):
        values = []
        for item in current:
            value = _get_parts(item, parts)
            if isinstance(value, list):
                values.extend(value)
            elif value is not None:
                values.append(value)
        return values
    if not isinstance(current, dict) or part not in current:
        return None
    return _get_parts(current[part], remaining)


def _set_value(document, dotted_key, value):
    current = document
    parts = dotted_key.split(".")
    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value


def _inc_value(document, dotted_key, amount):
    current = _get_value(document, dotted_key) or 0
    _set_value(document, dotted_key, current + amount)


def _unset_value(document, dotted_key):
    current = document
    parts = dotted_key.split(".")
    for part in parts[:-1]:
        current = current.get(part, {}) if isinstance(current, dict) else {}
    if isinstance(current, dict):
        current.pop(parts[-1], None)


def _value_matches(actual, expected):
    expected = _normalize(expected)
    if isinstance(actual, list):
        return any(_value_matches(item, expected) for item in actual)
    if isinstance(expected, dict):
        if "$in" in expected:
            return actual in [_normalize(item) for item in expected["$in"]]
        if "$ne" in expected:
            return actual != _normalize(expected["$ne"])
        if "$exists" in expected:
            exists = actual is not None
            return exists is bool(expected["$exists"])
        if "$regex" in expected:
            flags = re.I if expected.get("$options") == "i" else 0
            return re.search(expected["$regex"], str(actual or ""), flags) is not None
        if "$elemMatch" in expected:
            if not isinstance(actual, list):
                return False
            return any(_matches(item, expected["$elemMatch"]) for item in actual if isinstance(item, dict))
    return actual == expected


def _matches(document, query):
    for key, expected in (query or {}).items():
        if key == "$or":
            if not any(_matches(document, branch) for branch in expected):
                return False
            continue
        if key == "$and":
            if not all(_matches(document, branch) for branch in expected):
                return False
            continue
        if not _value_matches(_get_value(document, key), expected):
            return False
    return True


class SQLCursor:
    def __init__(self, documents):
        self.documents = documents
        self.index = 0

    def sort(self, key, direction=1):
        reverse = direction == -1
        self.documents.sort(key=lambda item: _get_value(item, key) or "", reverse=reverse)
        return self

    def limit(self, count):
        self.documents = self.documents[:count]
        return self

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.index >= len(self.documents):
            raise StopAsyncIteration
        item = copy.deepcopy(self.documents[self.index])
        self.index += 1
        return item


class SQLCollection:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def _all(self):
        try:
            rows = self.db.fetchall(
                "SELECT data FROM documents WHERE collection = {placeholder}",
                (self.name,),
            )
            return [json.loads(row["data"], object_hook=_json_object_hook) for row in rows]
        except self.db.error_classes as error:
            raise DatabaseError(str(error)) from error

    def _save(self, document):
        document = _normalize(document)
        try:
            self.db.execute(
                self.db.upsert_sql,
                (self.name, str(document["_id"]), json.dumps(document, default=_json_default)),
            )
            self.db.commit()
        except self.db.error_classes as error:
            raise DatabaseError(str(error)) from error

    async def insert_one(self, document):
        document = _normalize(copy.deepcopy(document))
        document.setdefault("_id", str(ObjectId()))
        self._save(document)
        return SimpleNamespace(inserted_id=document["_id"])

    async def replace_one(self, query, document, upsert=True):
        existing = await self.find_one(query)
        document = _normalize(copy.deepcopy(document))
        if existing:
            document["_id"] = existing["_id"]
        elif upsert:
            document.setdefault("_id", query.get("_id") or str(ObjectId()))
        else:
            return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=None)
        self._save(document)
        return SimpleNamespace(matched_count=1 if existing else 0, modified_count=1, upserted_id=document["_id"])

    async def find_one(self, query=None, projection=None):
        for document in self._all():
            if _matches(document, _normalize(query or {})):
                return copy.deepcopy(document)
        return None

    def find(self, query=None, projection=None):
        matched = [
            copy.deepcopy(document)
            for document in self._all()
            if _matches(document, _normalize(query or {}))
        ]
        return SQLCursor(matched)

    async def count_documents(self, query=None):
        return len([document for document in self._all() if _matches(document, _normalize(query or {}))])

    async def update_one(self, query, update, array_filters=None, upsert=False):
        return await self._update(query, update, first_only=True, upsert=upsert)

    async def update_many(self, query, update, upsert=False):
        return await self._update(query, update, first_only=False, upsert=upsert)

    async def _update(self, query, update, first_only, upsert=False):
        matched = 0
        modified = 0
        for document in self._all():
            if not _matches(document, _normalize(query or {})):
                continue
            matched += 1
            before = copy.deepcopy(document)
            self._apply_update(document, update)
            if document != before:
                modified += 1
                self._save(document)
            if first_only:
                break
        upserted_id = None
        if matched == 0 and upsert:
            document = {
                key: _normalize(value)
                for key, value in (query or {}).items()
                if not key.startswith("$") and not isinstance(value, dict)
            }
            document.setdefault("_id", str(ObjectId()))
            self._apply_update(document, update)
            self._save(document)
            modified = 1
            upserted_id = document["_id"]
        return SimpleNamespace(matched_count=matched, modified_count=modified, upserted_id=upserted_id)

    def _apply_update(self, document, update):
        if not any(str(key).startswith("$") for key in update):
            document.update(_normalize(update))
            return
        for key, value in update.get("$set", {}).items():
            if ".$[" in key:
                continue
            _set_value(document, key, _normalize(value))
        for key, value in update.get("$inc", {}).items():
            _inc_value(document, key, value)
        for key in update.get("$unset", {}):
            _unset_value(document, key)
        for key, value in update.get("$push", {}).items():
            items = _get_value(document, key) or []
            if not isinstance(items, list):
                items = []
            items.append(_normalize(value))
            _set_value(document, key, items)

    async def delete_one(self, query):
        deleted = 0
        for document in self._all():
            if _matches(document, _normalize(query or {})):
                try:
                    self.db.execute(
                        "DELETE FROM documents WHERE collection = {placeholder} AND id = {placeholder}",
                        (self.name, str(document["_id"])),
                    )
                    self.db.commit()
                except self.db.error_classes as error:
                    raise DatabaseError(str(error)) from error
                deleted = 1
                break
        return SimpleNamespace(deleted_count=deleted)

    async def delete_many(self, query):
        deleted = 0
        for document in self._all():
            if _matches(document, _normalize(query or {})):
                try:
                    self.db.execute(
                        "DELETE FROM documents WHERE collection = {placeholder} AND id = {placeholder}",
                        (self.name, str(document["_id"])),
                    )
                except self.db.error_classes as error:
                    raise DatabaseError(str(error)) from error
                deleted += 1
        try:
            self.db.commit()
        except self.db.error_classes as error:
            raise DatabaseError(str(error)) from error
        return SimpleNamespace(deleted_count=deleted)

    async def find_one_and_delete(self, query):
        document = await self.find_one(query)
        if document:
            await self.delete_one({"_id": document["_id"]})
        return document

    async def create_index(self, *args, **kwargs):
        return kwargs.get("name") or "sql_document_index"

    async def drop_index(self, *args, **kwargs):
        return None

    async def index_information(self):
        return {}


class SQLDatabase:
    def __init__(self):
        self.raw_url = _database_url()
        self.engine = "mysql" if self.raw_url.startswith(("mysql://", "mysql+pymysql://")) else "sqlite"
        self.placeholder = "%s" if self.engine == "mysql" else "?"
        self.path = None if self.engine == "mysql" else _database_path()
        self.error_classes = (sqlite3.Error,)
        if self.engine == "mysql":
            if pymysql is None:
                raise DatabaseError("PyMySQL is required for MySQL DATABASE_URL")
            self.error_classes = (pymysql.MySQLError,)
        try:
            if self.engine == "mysql":
                self.connection = pymysql.connect(
                    **_mysql_config(self.raw_url),
                    cursorclass=pymysql.cursors.DictCursor,
                )
                create_sql = """
                    CREATE TABLE IF NOT EXISTS documents (
                        collection VARCHAR(80) NOT NULL,
                        id VARCHAR(120) NOT NULL,
                        data JSON NOT NULL,
                        PRIMARY KEY (collection, id)
                    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
                """
                self.upsert_sql = """
                    INSERT INTO documents (collection, id, data)
                    VALUES ({placeholder}, {placeholder}, {placeholder})
                    ON DUPLICATE KEY UPDATE data = VALUES(data)
                """
            else:
                self.connection = sqlite3.connect(self.path, check_same_thread=False)
                self.connection.row_factory = sqlite3.Row
                create_sql = """
                    CREATE TABLE IF NOT EXISTS documents (
                        collection TEXT NOT NULL,
                        id TEXT NOT NULL,
                        data TEXT NOT NULL,
                        PRIMARY KEY (collection, id)
                    )
                """
                self.upsert_sql = """
                    INSERT INTO documents (collection, id, data)
                    VALUES ({placeholder}, {placeholder}, {placeholder})
                    ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data
                """
            self.execute(create_sql)
            if self.engine == "mysql":
                self.execute(
                    """
                    CREATE OR REPLACE VIEW users_view AS
                    SELECT
                        id,
                        JSON_UNQUOTE(JSON_EXTRACT(data, '$.username')) AS email,
                        JSON_UNQUOTE(JSON_EXTRACT(data, '$.firstName')) AS first_name,
                        JSON_UNQUOTE(JSON_EXTRACT(data, '$.lastName')) AS last_name,
                        JSON_UNQUOTE(JSON_EXTRACT(data, '$.role')) AS role,
                        JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')) AS phone,
                        JSON_UNQUOTE(JSON_EXTRACT(data, '$.gender')) AS gender,
                        JSON_UNQUOTE(JSON_EXTRACT(data, '$.createdAt')) AS created_at
                    FROM documents
                    WHERE collection = 'users'
                    """
                )
            self.commit()
        except self.error_classes as error:
            raise DatabaseError(str(error)) from error

    def sql(self, statement):
        return statement.format(placeholder=self.placeholder)

    def execute(self, statement, params=()):
        cursor = self.connection.cursor()
        cursor.execute(self.sql(statement), params)
        return cursor

    def fetchall(self, statement, params=()):
        cursor = self.execute(statement, params)
        rows = cursor.fetchall()
        if self.engine == "sqlite":
            return [dict(row) for row in rows]
        return rows

    def commit(self):
        self.connection.commit()

    def __getattr__(self, name):
        collection = SQLCollection(self, name)
        setattr(self, name, collection)
        return collection

    async def command(self, command_name):
        if command_name != "ping":
            return {"ok": 1}
        try:
            self.execute("SELECT 1").fetchone()
        except self.error_classes as error:
            raise DatabaseError(str(error)) from error
        return {"ok": 1}


class SQLClient:
    def close(self):
        database.connection.close()


database = SQLDatabase()
client = SQLClient()
