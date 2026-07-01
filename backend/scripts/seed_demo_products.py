import asyncio
from pathlib import Path
import sys

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from app.db.database import client, database


DEMO_SELLER = "Bazario Curated"
DEMO_VARIANT_OPTIONS = {
    "demo-clothes-linen-shirt": {
        "size": ["S", "M", "L", "XL"],
        "colour": ["White", "Navy"],
    },
    "demo-clothes-essential-tee": {
        "size": ["XS", "S", "M", "L", "XL"],
        "colour": ["Black", "White", "Sage"],
    },
    "demo-clothes-denim-jacket": {
        "size": ["S", "M", "L", "XL"],
        "colour": ["Indigo", "Washed Black"],
    },
    "demo-electronics-headphones": {
        "colour": ["Midnight", "Sand"],
        "configuration": ["Standard"],
    },
    "demo-electronics-watch": {
        "colour": ["Graphite", "Rose"],
        "configuration": ["Bluetooth", "Bluetooth + GPS"],
    },
    "demo-electronics-speaker": {
        "colour": ["Charcoal", "Blue"],
        "configuration": ["16W", "24W"],
    },
    "demo-cosmetics-serum": {
        "shade": ["Transparent"],
        "volume": ["15ml", "30ml"],
    },
    "demo-cosmetics-lip-tint": {
        "shade": ["Rosewood", "Berry", "Nude"],
        "volume": ["5ml"],
    },
    "demo-cosmetics-cleanser": {
        "shade": ["Original"],
        "volume": ["100ml", "200ml"],
    },
    "demo-medicines-first-aid": {"packSize": ["24-piece", "40-piece"]},
    "demo-medicines-bandages": {"packSize": ["30 strips", "60 strips"]},
    "demo-medicines-thermometer": {"packSize": ["Single unit", "Twin pack"]},
}

DEMO_PRODUCTS = [
    {
        "seed_key": "demo-clothes-linen-shirt",
        "name": "Harbor Linen Shirt",
        "price": 1499,
        "description": "A breathable everyday shirt with a clean collar and an easy, relaxed silhouette.",
        "category": "clothes",
        "image": "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=1000&q=85",
        "stock": 34,
        "details": {
            "fabric": "Premium linen blend",
            "fit": "Relaxed fit",
            "sizeRange": "S, M, L, XL",
            "care": "Machine wash cold",
        },
    },
    {
        "seed_key": "demo-clothes-essential-tee",
        "name": "Form Essential T-Shirt",
        "price": 699,
        "description": "A heavyweight cotton T-shirt designed with a structured drape and soft finish.",
        "category": "clothes",
        "image": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=85",
        "stock": 52,
        "details": {
            "fabric": "240 GSM cotton",
            "fit": "Regular fit",
            "sizeRange": "XS, S, M, L, XL",
            "care": "Wash inside out",
        },
    },
    {
        "seed_key": "demo-clothes-denim-jacket",
        "name": "Northline Denim Jacket",
        "price": 2499,
        "description": "A versatile mid-weight denim layer with practical pockets and timeless detailing.",
        "category": "clothes",
        "image": "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=1000&q=85",
        "stock": 18,
        "details": {
            "fabric": "Washed cotton denim",
            "fit": "Classic fit",
            "sizeRange": "S, M, L, XL",
            "care": "Gentle machine wash",
        },
    },
    {
        "seed_key": "demo-electronics-headphones",
        "name": "Sonic Arc Headphones",
        "price": 3999,
        "description": "Comfortable wireless headphones with balanced sound, deep bass, and active noise cancellation.",
        "category": "electronics",
        "image": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85",
        "stock": 26,
        "details": {
            "brand": "Sonic Arc",
            "model": "SA-H7",
            "warranty": "1 year",
            "power": "40-hour battery",
        },
    },
    {
        "seed_key": "demo-electronics-watch",
        "name": "Pulse Mini Smartwatch",
        "price": 2899,
        "description": "A compact smartwatch for activity tracking, notifications, sleep insights, and daily routines.",
        "category": "electronics",
        "image": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=85",
        "stock": 31,
        "details": {
            "brand": "Pulse",
            "model": "Mini S2",
            "warranty": "1 year",
            "power": "Up to 7 days",
        },
    },
    {
        "seed_key": "demo-electronics-speaker",
        "name": "Drift Portable Speaker",
        "price": 2199,
        "description": "A water-resistant Bluetooth speaker with warm sound and a travel-friendly profile.",
        "category": "electronics",
        "image": "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=1000&q=85",
        "stock": 23,
        "details": {
            "brand": "Drift Audio",
            "model": "D1",
            "warranty": "1 year",
            "power": "16-hour battery",
        },
    },
    {
        "seed_key": "demo-cosmetics-serum",
        "name": "Dewdrop Vitamin C Serum",
        "price": 899,
        "description": "A lightweight brightening serum formulated for a fresh, even-looking complexion.",
        "category": "cosmetics",
        "image": "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=1000&q=85",
        "stock": 44,
        "details": {
            "skinType": "All skin types",
            "shade": "Transparent",
            "ingredients": "Vitamin C, hyaluronic acid",
            "expiry": "12 months after opening",
        },
    },
    {
        "seed_key": "demo-cosmetics-lip-tint",
        "name": "Velvet Bloom Lip Tint",
        "price": 549,
        "description": "A comfortable soft-matte tint with buildable colour and a smooth, weightless feel.",
        "category": "cosmetics",
        "image": "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1000&q=85",
        "stock": 39,
        "details": {
            "skinType": "Suitable for all",
            "shade": "Rosewood",
            "ingredients": "Vitamin E, jojoba oil",
            "expiry": "18 months after opening",
        },
    },
    {
        "seed_key": "demo-cosmetics-cleanser",
        "name": "Cloud Gentle Cleanser",
        "price": 649,
        "description": "A non-stripping daily cleanser that removes impurities while keeping skin comfortable.",
        "category": "cosmetics",
        "image": "https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=1000&q=85",
        "stock": 47,
        "details": {
            "skinType": "Normal, dry, sensitive",
            "shade": "Pearl white",
            "ingredients": "Ceramides, aloe vera",
            "expiry": "12 months after opening",
        },
    },
    {
        "seed_key": "demo-medicines-first-aid",
        "name": "Everyday First Aid Kit",
        "price": 799,
        "description": "A compact set of basic first-aid supplies for minor cuts, scrapes, and everyday emergencies.",
        "category": "medicines",
        "image": "https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&w=1000&q=85",
        "stock": 29,
        "details": {
            "dosage": "24-piece kit",
            "usage": "Follow instructions supplied with each item",
            "manufacturer": "Bazario Health Essentials",
            "expiry": "See individual packaging",
        },
    },
    {
        "seed_key": "demo-medicines-bandages",
        "name": "Comfort Flex Bandages",
        "price": 149,
        "description": "Breathable adhesive bandages in assorted sizes for protecting minor cuts and abrasions.",
        "category": "medicines",
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1000&q=85",
        "stock": 75,
        "details": {
            "dosage": "30 assorted strips",
            "usage": "Single use on clean, dry skin",
            "manufacturer": "CareForm",
            "expiry": "24 months from manufacture",
        },
    },
    {
        "seed_key": "demo-medicines-thermometer",
        "name": "ClearRead Digital Thermometer",
        "price": 349,
        "description": "A simple digital thermometer with a clear display and quick temperature readings.",
        "category": "medicines",
        "image": "https://images.unsplash.com/photo-1559757175-0eb30cd8c063?auto=format&fit=crop&w=1000&q=85",
        "stock": 36,
        "details": {
            "dosage": "Digital oral or underarm use",
            "usage": "Use according to enclosed instructions",
            "manufacturer": "ClearRead Health",
            "expiry": "Not applicable",
        },
    },
]


async def seed_products():
    created = 0
    updated = 0

    for product in DEMO_PRODUCTS:
        image = product["image"]
        details = dict(product["details"])
        option_sets = DEMO_VARIANT_OPTIONS[product["seed_key"]]
        dimensions = list(option_sets)
        if product["category"] == "clothes":
            details["colors"] = ", ".join(option_sets["colour"])
        elif product["category"] == "electronics":
            details["colors"] = ", ".join(option_sets["colour"])
            details["configurations"] = ", ".join(option_sets["configuration"])
        elif product["category"] == "cosmetics":
            details["shades"] = ", ".join(option_sets["shade"])
            details["volumes"] = ", ".join(option_sets["volume"])
        else:
            details["packSizes"] = ", ".join(option_sets["packSize"])
            details["prescriptionRequired"] = "No"

        combinations = [{}]
        for dimension in dimensions:
            combinations = [
                {**combination, dimension: value}
                for combination in combinations
                for value in option_sets[dimension]
            ]
        variants = []
        if combinations:
            base_stock, remainder = divmod(product["stock"], len(combinations))
            variants = [
                {
                    "options": options,
                    "stock": base_stock + (1 if index < remainder else 0),
                }
                for index, options in enumerate(combinations)
            ]
        values = {
            **product,
            "details": details,
            "variants": variants,
            "images": [image],
            "seller": DEMO_SELLER,
            "is_demo": True,
        }
        result = await database.products.update_one(
            {"seed_key": product["seed_key"]},
            {"$set": values},
            upsert=True,
        )
        if result.upserted_id:
            created += 1
        else:
            updated += 1

    print(
        f"Demo catalog ready: {created} created, {updated} updated, "
        f"{len(DEMO_PRODUCTS)} total."
    )
    counts = {}
    for category in ("clothes", "electronics", "cosmetics", "medicines"):
        counts[category] = await database.products.count_documents(
            {"is_demo": True, "category": category}
        )
    print(
        "Demo products by category: "
        + ", ".join(f"{category}={count}" for category, count in counts.items())
    )


if __name__ == "__main__":
    try:
        asyncio.run(seed_products())
    finally:
        client.close()
