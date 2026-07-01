import unittest

from app.api.routes.cart import get_available_sizes, get_product_variant


class CartVariantTests(unittest.TestCase):
    def test_clothing_sizes_are_parsed_from_product_details(self):
        product = {
            "category": "clothes",
            "details": {"sizeRange": "S, M, L, XL"},
        }

        self.assertEqual(get_available_sizes(product), ["S", "M", "L", "XL"])

    def test_non_clothing_product_has_no_size_variant(self):
        product = {
            "category": "electronics",
            "details": {"sizeRange": "Standard"},
        }

        self.assertEqual(get_available_sizes(product), [])

    def test_exact_size_and_colour_variant_is_selected(self):
        product = {
            "variants": [
                {"size": "S", "color": "Navy", "stock": 3},
                {"size": "M", "color": "White", "stock": 5},
            ]
        }

        self.assertEqual(
            get_product_variant(product, "m", "white"),
            {"size": "M", "color": "White", "stock": 5},
        )

    def test_generic_electronics_variant_is_selected(self):
        product = {
            "variants": [
                {
                    "options": {
                        "colour": "Black",
                        "configuration": "8GB + 128GB",
                    },
                    "stock": 4,
                }
            ]
        }

        self.assertEqual(
            get_product_variant(
                product,
                selected_options={
                    "colour": "black",
                    "configuration": "8gb + 128gb",
                },
            )["stock"],
            4,
        )


if __name__ == "__main__":
    unittest.main()
