from jose import jwt, JWTError
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
import os
from app.db.database import database
from app.config.security import validate_secret_key

SECRET_KEY = validate_secret_key()
ALGORITHM = os.getenv("ALGORITHM", "HS256")

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="auth/login"
)


# --------------------
# VERIFY TOKEN
# --------------------
def decode_token(token: str):

    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        username = payload.get("sub")

        if username is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid token"
            )

        return payload

    except JWTError:

        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )


def verify_token(token: str):
    payload = decode_token(token)
    return payload.get("sub")


# --------------------
# CURRENT USER
# --------------------
async def get_current_user(
    token: str = Depends(oauth2_scheme)
):
    token_data = decode_token(token)
    username = token_data.get("sub")
    user = await database.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    if int(user.get("token_version", 0)) != int(token_data.get("ver", 0)):
        raise HTTPException(status_code=401, detail="Session has been revoked")
    return user


# --------------------
# SELLER CHECK
# --------------------
async def seller_only(
    token: str = Depends(oauth2_scheme)
):

    user = await get_current_user(token)

    if user.get("role") != "seller":

        raise HTTPException(
            status_code=403,
            detail="Only sellers allowed"
        )

    return user["username"]


async def admin_only(token: str = Depends(oauth2_scheme)):
    user = await get_current_user(token)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins allowed")
    return user["username"]
