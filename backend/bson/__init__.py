import os
import re


class ObjectId(str):
    _pattern = re.compile(r"^[0-9a-fA-F]{24}$")

    def __new__(cls, value=None):
        if value is None:
            value = os.urandom(12).hex()
        value = str(value)
        if not cls._pattern.fullmatch(value):
            raise InvalidId("ObjectId must be a 24-character hex string")
        return str.__new__(cls, value.lower())


class Binary(bytes):
    pass


class InvalidId(ValueError):
    pass
