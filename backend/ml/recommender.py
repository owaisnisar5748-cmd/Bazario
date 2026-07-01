import pandas as pd

def recommend_products(user_category):
    data = pd.DataFrame([
        ["Shoes", "Nike Shoes"],
        ["Clothes", "T-Shirt"],
        ["Cosmetics", "Lipstick"],
        ["Medicine", "Paracetamol"]
    ], columns=["category", "product"])

    return data[data["category"] == user_category].to_dict(orient="records")