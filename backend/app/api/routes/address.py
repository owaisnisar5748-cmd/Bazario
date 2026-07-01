from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.db.database import database
from app.utils.auth_handler import get_current_user

router = APIRouter()


# --------------------
# ADDRESS MODEL
# --------------------
class Address(BaseModel):

    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=7, max_length=20)
    address_line: str = Field(min_length=5, max_length=250)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    pincode: str = Field(min_length=3, max_length=12)


# --------------------
# ADD ADDRESS
# --------------------
@router.post("/add")
async def add_address(
    address: Address,
    current_user: dict = Depends(get_current_user)
):

    address_dict = address.model_dump()
    address_dict["username"] = current_user["username"]

    result = await database.addresses.insert_one(
        address_dict
    )

    address_dict["_id"] = str(
        result.inserted_id
    )

    return {
        "message": "Address added successfully",
        "address": address_dict
    }


# --------------------
# GET ADDRESSES
# --------------------
@router.get("/")
async def get_addresses(current_user: dict = Depends(get_current_user)):

    addresses = []

    async for address in database.addresses.find({"username": current_user["username"]}):

        address["_id"] = str(address["_id"])

        addresses.append(address)

    return {
        "addresses": addresses
    }


@router.put("/{address_id}")
async def update_address(
    address_id: str,
    address: Address,
    current_user: dict = Depends(get_current_user),
):
    try:
        object_id = ObjectId(address_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid address")

    values = address.model_dump()
    result = await database.addresses.update_one(
        {"_id": object_id, "username": current_user["username"]},
        {"$set": values},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Address not found")

    values["_id"] = address_id
    values["username"] = current_user["username"]
    return {"message": "Address updated successfully", "address": values}


@router.delete("/{address_id}")
async def delete_address(
    address_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        object_id = ObjectId(address_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid address")

    result = await database.addresses.delete_one(
        {"_id": object_id, "username": current_user["username"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Address not found")
    return {"message": "Address removed successfully"}
