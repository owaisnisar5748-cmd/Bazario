import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { cartApi } from "../services/api";
import "./Storefront.css";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=500&q=80";

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatOptions(item) {
  const options = item.selected_options || {};
  if (Object.keys(options).length) return Object.values(options).join(" | ");
  return [item.selected_size && `Size ${item.selected_size}`, item.selected_color]
    .filter(Boolean)
    .join(" | ");
}

function Cart() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const loadCart = useCallback(() => {
    setLoading(true);
    cartApi.getCart()
      .then((response) => {
        setItems(response.data.cart || []);
        setError("");
      })
      .catch((requestError) => setError(requestError.response?.data?.detail || "Could not load cart."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => loadCart(), [loadCart]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items]
  );

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const updateQuantity = async (item, quantity) => {
    if (quantity < 1) return;
    setBusyId(item._id);
    try {
      await cartApi.updateQuantity(item._id, quantity);
      setItems((current) => current.map((entry) => entry._id === item._id ? { ...entry, quantity } : entry));
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not update cart.");
    } finally {
      setBusyId("");
    }
  };

  const removeItem = async (itemId) => {
    setBusyId(itemId);
    try {
      await cartApi.removeItem(itemId);
      setItems((current) => current.filter((item) => item._id !== itemId));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not remove item.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="store-page">
      <Navbar />
      <main className="store-shell">
        <section className="checkout-hero">
          <div>
            <p className="store-eyebrow">Your basket</p>
            <h1>Review the edit before checkout.</h1>
            <p>Adjust quantities, remove anything you do not need, and move into a clean checkout flow.</p>
          </div>
          <button className="store-button store-button--ghost" type="button" onClick={() => navigate("/products")}>
            Continue shopping
          </button>
        </section>

        {error && <div className="store-alert store-alert--error checkout-alert">{error}</div>}
        {loading && <div className="store-state">Loading cart...</div>}

        {!loading && items.length === 0 && (
          <div className="orders-empty">
            <ShoppingBag size={34} />
            <h2>Your cart is empty</h2>
            <p>Add a few focused finds before checkout.</p>
            <button className="store-button" type="button" onClick={() => navigate("/products")}>
              Browse products <ArrowRight size={16} />
            </button>
          </div>
        )}

        {!loading && items.length > 0 && (
          <section className="checkout-grid">
            <div className="store-list">
              {items.map((item) => (
                <article className="store-card cart-row" key={item._id}>
                  <img src={item.image || FALLBACK_IMAGE} alt={item.product_name} />
                  <div className="cart-row__content">
                    <p className="store-eyebrow">Cart item</p>
                    <h3>{item.product_name}</h3>
                    {formatOptions(item) && (
                      <span className="cart-variant">
                        {formatOptions(item)}
                      </span>
                    )}
                    <p className="store-price">{formatCurrency(item.price)}</p>
                    <div className="quantity-control" aria-label={`Quantity for ${item.product_name}`}>
                      <button
                        disabled={busyId === item._id}
                        type="button"
                        onClick={() => updateQuantity(item, item.quantity - 1)}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={16} />
                      </button>
                      <input readOnly value={item.quantity} />
                      <button
                        disabled={busyId === item._id}
                        type="button"
                        onClick={() => updateQuantity(item, item.quantity + 1)}
                        aria-label="Increase quantity"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                  <button
                    className="store-button store-button--danger"
                    disabled={busyId === item._id}
                    type="button"
                    onClick={() => removeItem(item._id)}
                  >
                    <Trash2 size={17} /> Remove
                  </button>
                </article>
              ))}
            </div>

            <aside className="checkout-summary">
              <p className="store-eyebrow">Order summary</p>
              <h2>{itemCount} item{itemCount === 1 ? "" : "s"}</h2>
              <div className="summary-row"><span>Subtotal</span><strong>{formatCurrency(total)}</strong></div>
              <div className="summary-row"><span>Delivery</span><strong>Free</strong></div>
              <div className="summary-row"><span>Payment</span><strong>Cash on delivery</strong></div>
              <div className="summary-row summary-row--total"><span>Total</span><span>{formatCurrency(total)}</span></div>
              <button className="store-button checkout-summary__button" type="button" onClick={() => navigate("/checkout")}>
                Continue to checkout <ArrowRight size={16} />
              </button>
            </aside>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default Cart;
