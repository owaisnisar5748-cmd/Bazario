import { ArrowLeft, BadgeCheck, Heart, Minus, Plus, ShoppingBag, ShoppingCart, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { cartApi, productsApi, reviewsApi, wishlistApi } from "../services/api";
import { getStoredUser, getUserRole } from "../services/auth";
import { getCategoryLabel } from "../services/categories";
import "./Storefront.css";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1000&q=80";

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDetailLabel(value) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

const optionLabels = {
  size: "Size",
  colour: "Colour",
  configuration: "RAM / storage",
  shade: "Shade",
  volume: "Volume",
  packSize: "Pack size",
};

function getVariantOptions(variant) {
  return variant.options || {
    size: variant.size || "",
    colour: variant.color || "",
  };
}

function formatReviewOptions(item) {
  const options = Object.values(item.selected_options || {}).filter(Boolean);
  if (options.length) return options.join(" | ");
  return [item.selected_size && `Size ${item.selected_size}`, item.selected_color]
    .filter(Boolean)
    .join(" | ");
}

function ProductDetails() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [review, setReview] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    Promise.all([productsApi.getById(productId), reviewsApi.getAll(productId)])
      .then(([productResponse, reviewResponse]) => {
        setProduct(productResponse.data.product);
        setReviews(reviewResponse.data.reviews || []);
      })
      .catch((error) => setNotice({ type: "error", text: error.response?.data?.detail || "Could not load product." }))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    setSelectedImage(0);
  }, [productId]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviews.length;
  }, [reviews]);

  const ratingBreakdown = useMemo(() => {
    const counts = [5, 4, 3, 2, 1].map((value) => ({
      rating: value,
      count: reviews.filter((item) => Number(item.rating) === value).length,
    }));
    return counts.map((item) => ({
      ...item,
      percentage: reviews.length ? Math.round((item.count / reviews.length) * 100) : 0,
    }));
  }, [reviews]);

  const productImages = useMemo(() => {
    if (!product) return [];
    return Array.from(new Set([product.image, ...(product.images || [])].filter(Boolean)));
  }, [product]);

  const selectedProductImage = productImages[selectedImage] || productImages[0] || FALLBACK_IMAGE;
  const variantDimensions = useMemo(() => {
    const firstVariant = product?.variants?.[0];
    return firstVariant ? Object.keys(getVariantOptions(firstVariant)) : [];
  }, [product]);
  const selectedVariant = useMemo(
    () =>
      product?.variants?.find(
        (variant) => {
          const options = getVariantOptions(variant);
          return variantDimensions.every(
            (dimension) => options[dimension] === selectedOptions[dimension]
          );
        }
      ) || null,
    [product, selectedOptions, variantDimensions]
  );
  const availableStock = selectedVariant ? Number(selectedVariant.stock || 0) : Number(product?.stock || 0);

  useEffect(() => {
    if (!product?.variants?.length) {
      setSelectedOptions({});
      return;
    }
    setSelectedOptions(getVariantOptions(product.variants[0]));
  }, [productId, product]);

  useEffect(() => {
    setQuantity((current) => Math.max(1, Math.min(current, availableStock || 1)));
  }, [availableStock]);

  const requireCustomer = () => {
    const user = getStoredUser();

    if (!user) {
      navigate("/login", { state: { from: `/products/${productId}` } });
      return false;
    }

    if (getUserRole(user) !== "customer") {
      setNotice({
        type: "error",
        text: "Seller accounts can manage products from the seller dashboard. Customer actions are disabled.",
      });
      return false;
    }

    return true;
  };

  const addToCart = async () => {
    if (!requireCustomer()) return;
    setBusy(true);
    try {
      const response = await cartApi.addItem(product, quantity, selectedOptions);
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.detail || "Could not add product to cart." });
    } finally {
      setBusy(false);
    }
  };

  const buyNow = async () => {
    if (!requireCustomer()) return;
    setBuying(true);
    setNotice(null);
    try {
      await cartApi.addItem(product, quantity, selectedOptions);
      navigate("/checkout");
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.detail || "Could not prepare this product for checkout.",
      });
      setBuying(false);
    }
  };

  const saveProduct = async () => {
    if (!requireCustomer()) return;
    setSaving(true);
    try {
      const response = await wishlistApi.add(product._id);
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.detail || "Could not save product." });
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    if (!requireCustomer()) return;
    try {
      const response = await reviewsApi.add({
        product_id: product._id,
        rating: Number(rating),
        title: reviewTitle.trim(),
        review: review.trim(),
      });
      setReviews((current) => [response.data.review, ...current.filter((item) => item._id !== response.data.review._id)]);
      setReviewTitle("");
      setReview("");
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.detail || "Could not submit review." });
    }
  };

  if (loading) {
    return (
      <div className="store-page">
        <Navbar />
        <main className="store-shell"><div className="store-state">Loading product...</div></main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="store-page">
        <Navbar />
        <main className="store-shell"><div className="store-alert store-alert--error">{notice?.text || "Product not found."}</div></main>
      </div>
    );
  }

  return (
    <div className="store-page">
      <Navbar />
      <main className="store-shell">
        <button className="product-back" type="button" onClick={() => navigate("/products")}>
          <ArrowLeft size={16} /> Back to products
        </button>

        {notice && <div className={`store-alert store-alert--${notice.type} checkout-alert`}>{notice.text}</div>}

        <section className="product-detail">
          <div className="product-detail__media">
            <img className="product-detail__image" src={selectedProductImage} alt={product.name} />
            {productImages.length > 1 && (
              <div className="product-detail__thumbs" aria-label="Product image gallery">
                {productImages.map((image, index) => (
                  <button
                    className={selectedImage === index ? "is-active" : ""}
                    key={image}
                    type="button"
                    aria-label={`Show product image ${index + 1}`}
                    onClick={() => setSelectedImage(index)}
                  >
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="product-detail__content">
            <p className="store-eyebrow">{getCategoryLabel(product.category)}</p>
            <h1>{product.name}</h1>
            <div className="product-detail__rating">
              <span><Star size={16} fill="currentColor" /> {averageRating ? averageRating.toFixed(1) : "New"}</span>
              <span>{reviews.length} review{reviews.length === 1 ? "" : "s"}</span>
            </div>
            <div className="store-price">{formatCurrency(product.price)}</div>
            <p className="product-detail__description">{product.description}</p>
            {product.category === "medicines"
              && String(product.details?.prescriptionRequired || "").toLowerCase() === "yes"
              && (
                <div className="prescription-product-note">
                  Prescription required. You will upload it securely during checkout.
                </div>
              )}

            {Object.values(product.details || {}).some(Boolean) && (
              <dl className="product-detail__specs">
                {Object.entries(product.details).filter(([, value]) => value).map(([key, value]) => (
                  <div key={key}>
                    <dt>{formatDetailLabel(key)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="product-detail__meta">
              <span className={`store-stock ${product.stock > 0 ? "" : "store-stock--out"}`}>
                {availableStock > 0 ? `${availableStock} available` : "Currently out of stock"}
              </span>
              <span>Sold by {product.seller || "Bazario seller"}</span>
            </div>

            <div className="product-detail__buy">
              <div className="product-options">
                {variantDimensions.map((dimension, dimensionIndex) => {
                  const precedingDimensions = variantDimensions.slice(0, dimensionIndex);
                  const values = Array.from(
                    new Set(
                      product.variants
                        .filter((variant) => {
                          const options = getVariantOptions(variant);
                          return precedingDimensions.every(
                            (key) => options[key] === selectedOptions[key]
                          );
                        })
                        .map((variant) => getVariantOptions(variant)[dimension])
                        .filter(Boolean)
                    )
                  );
                  return (
                    <fieldset className="size-selector color-selector" key={dimension}>
                      <legend>Select {optionLabels[dimension] || formatDetailLabel(dimension)}</legend>
                      <div>
                        {values.map((value) => {
                          const combinationAvailable = product.variants.some((variant) => {
                            const options = getVariantOptions(variant);
                            const candidate = { ...selectedOptions, [dimension]: value };
                            return variantDimensions
                              .slice(0, dimensionIndex + 1)
                              .every((key) => options[key] === candidate[key])
                              && Number(variant.stock || 0) > 0;
                          });
                          return (
                          <button
                            aria-pressed={selectedOptions[dimension] === value}
                            className={selectedOptions[dimension] === value ? "is-selected" : ""}
                            disabled={!combinationAvailable}
                            key={value}
                            type="button"
                            onClick={() => {
                              const nextOptions = {
                                ...selectedOptions,
                                [dimension]: value,
                              };
                              const matchingVariant = product.variants.find((variant) => {
                                const options = getVariantOptions(variant);
                                return variantDimensions
                                  .slice(0, dimensionIndex + 1)
                                  .every((key) => options[key] === nextOptions[key])
                                  && Number(variant.stock || 0) > 0;
                              });
                              setSelectedOptions(
                                matchingVariant ? getVariantOptions(matchingVariant) : nextOptions
                              );
                            }}
                          >
                            {value}
                          </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}

                <div className="quantity-selector">
                  <span>Quantity</span>
                  <div className="quantity-control" aria-label="Quantity">
                    <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} aria-label="Decrease quantity">
                      <Minus size={16} />
                    </button>
                    <input readOnly value={quantity} aria-label="Selected quantity" />
                    <button disabled={quantity >= availableStock} type="button" onClick={() => setQuantity((current) => Math.min(availableStock, current + 1))} aria-label="Increase quantity">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="store-actions">
                <button className="store-button product-buy-now" disabled={buying || busy || availableStock === 0 || (variantDimensions.length > 0 && !selectedVariant)} type="button" onClick={buyNow}>
                  <ShoppingBag size={18} /> {buying ? "Preparing checkout..." : "Buy now"}
                </button>
                <button className="store-button store-button--ghost" disabled={busy || buying || availableStock === 0 || (variantDimensions.length > 0 && !selectedVariant)} type="button" onClick={addToCart}>
                  <ShoppingCart size={18} /> {busy ? "Adding..." : "Add to cart"}
                </button>
                <button className="store-button store-button--ghost" disabled={saving} type="button" onClick={saveProduct}>
                  <Heart size={18} /> {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="reviews-section">
          <div className="store-heading">
            <div>
              <p className="store-eyebrow">Buyer notes</p>
              <h2>Reviews from verified buyers</h2>
              <p>Only customers with delivered orders can review this product.</p>
            </div>
          </div>

          <div className="checkout-grid">
            <div>
              <section className="review-summary">
                <div>
                  <strong>{averageRating ? averageRating.toFixed(1) : "New"}</strong>
                  <span><Star size={16} fill="currentColor" /> {reviews.length} verified review{reviews.length === 1 ? "" : "s"}</span>
                </div>
                <div className="review-bars">
                  {ratingBreakdown.map((item) => (
                    <span key={item.rating}>
                      <b>{item.rating}</b>
                      <i><em style={{ width: `${item.percentage}%` }} /></i>
                      <small>{item.count}</small>
                    </span>
                  ))}
                </div>
              </section>

              <div className="reviews-list">
                {reviews.map((item) => (
                  <article className="review-card" key={item._id}>
                    <header>
                      <strong><Star size={16} fill="currentColor" /> {item.rating}/5</strong>
                      {item.verified_purchase && <span><BadgeCheck size={15} /> Verified purchase</span>}
                    </header>
                    {item.title && <h3>{item.title}</h3>}
                    <p>{item.review}</p>
                    <small>
                      {(item.buyer_name || item.username)} | {formatDate(item.created_at)}
                      {formatReviewOptions(item) ? ` | ${formatReviewOptions(item)}` : ""}
                    </small>
                    {item.seller_reply && (
                      <div className="review-reply">
                        <b>Seller response</b>
                        <p>{item.seller_reply.message}</p>
                        <small>{formatDate(item.seller_reply.created_at)}</small>
                      </div>
                    )}
                  </article>
                ))}
                {reviews.length === 0 && <div className="store-state">No reviews yet.</div>}
              </div>
            </div>

            <form className="store-card store-form review-form" onSubmit={submitReview}>
              <p className="store-eyebrow">Write a review</p>
              <h2>Your experience</h2>
              <label className="store-field">Rating
                <select className="store-select" value={rating} onChange={(event) => setRating(event.target.value)}>
                  {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}
                </select>
              </label>
              <label className="store-field">Review title
                <input
                  className="store-input"
                  maxLength="90"
                  value={reviewTitle}
                  placeholder="Short summary"
                  onChange={(event) => setReviewTitle(event.target.value)}
                />
              </label>
              <label className="store-field">Review
                <textarea
                  className="store-textarea"
                  minLength="3"
                  required
                  value={review}
                  placeholder="Share what future buyers should know..."
                  onChange={(event) => setReview(event.target.value)}
                />
              </label>
              <button className="store-button" type="submit">Submit review</button>
            </form>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default ProductDetails;
