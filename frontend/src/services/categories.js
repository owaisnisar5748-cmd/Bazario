export const PRODUCT_CATEGORIES = [
  { value: "clothes", label: "Clothes" },
  { value: "electronics", label: "Electronics" },
  { value: "cosmetics", label: "Cosmetics" },
  { value: "medicines", label: "Medicines" },
];

export function getCategoryLabel(value) {
  return PRODUCT_CATEGORIES.find((category) => category.value === value)?.label || value;
}
