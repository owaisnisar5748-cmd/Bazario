import {
  ArrowRight,
  Banknote,
  CreditCard,
  MapPin,
  FileCheck2,
  FileUp,
  Pencil,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { addressApi, cartApi, ordersApi, paymentsApi, prescriptionsApi } from "../services/api";
import { getStoredUser } from "../services/auth";
import "./Storefront.css";

const initialAddress = {
  full_name: "",
  phone: "",
  address_line: "",
  city: "",
  state: "",
  pincode: "",
};

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-bazario-razorpay="true"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.bazarioRazorpay = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the secure payment window."));
    document.body.appendChild(script);
  });
}

const paymentLabels = {
  cod: "Cash on delivery",
  upi: "UPI",
  card: "Credit or debit card",
};

function formatOptions(item) {
  const values = Object.values(item.selected_options || {});
  if (values.length) return values.join(" | ");
  return [item.selected_size && `Size ${item.selected_size}`, item.selected_color]
    .filter(Boolean)
    .join(" | ");
}

function Checkout() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [address, setAddress] = useState(initialAddress);
  const [showForm, setShowForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [paymentConfig, setPaymentConfig] = useState({ configured: false });
  const [prescription, setPrescription] = useState({
    required: false,
    status: "not_required",
    prescription: null,
  });
  const [uploadingPrescription, setUploadingPrescription] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    setAddress((current) => ({
      ...current,
      full_name: user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" "),
      phone: user?.phone || "",
    }));

    Promise.all([
      cartApi.getCart(),
      addressApi.getAll(),
      paymentsApi.getConfig(),
      prescriptionsApi.getCartStatus(),
    ])
      .then(([cartResponse, addressResponse, paymentResponse, prescriptionResponse]) => {
        const nextAddresses = addressResponse.data.addresses || [];
        setItems(cartResponse.data.cart || []);
        setAddresses(nextAddresses);
        setSelectedAddress(nextAddresses[0]?._id || "");
        setPaymentConfig(paymentResponse.data);
        setPrescription(prescriptionResponse.data);
      })
      .catch((error) => setNotice({ type: "error", text: error.response?.data?.detail || "Could not prepare checkout." }))
      .finally(() => setLoading(false));
  }, []);

  const total = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);
  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  const updateAddress = (event) => {
    setAddress((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const saveAddress = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = editingAddressId
        ? await addressApi.update(editingAddressId, address)
        : await addressApi.add(address);
      setAddresses((current) =>
        editingAddressId
          ? current.map((item) => item._id === editingAddressId ? response.data.address : item)
          : [...current, response.data.address]
      );
      setSelectedAddress(response.data.address._id);
      setAddress(initialAddress);
      setEditingAddressId("");
      setShowForm(false);
      setNotice({
        type: "success",
        text: editingAddressId ? "Delivery address updated." : "Delivery address saved.",
      });
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.detail || "Could not save address." });
    } finally {
      setBusy(false);
    }
  };

  const editAddress = (item) => {
    setAddress({
      full_name: item.full_name || "",
      phone: item.phone || "",
      address_line: item.address_line || "",
      city: item.city || "",
      state: item.state || "",
      pincode: item.pincode || "",
    });
    setEditingAddressId(item._id);
    setShowForm(true);
    setNotice(null);
  };

  const removeAddress = async (item) => {
    if (!window.confirm(`Remove the address for ${item.full_name}?`)) return;
    setBusy(true);
    try {
      await addressApi.remove(item._id);
      const remaining = addresses.filter((addressItem) => addressItem._id !== item._id);
      setAddresses(remaining);
      if (selectedAddress === item._id) setSelectedAddress(remaining[0]?._id || "");
      if (editingAddressId === item._id) {
        setEditingAddressId("");
        setShowForm(false);
        setAddress(initialAddress);
      }
      setNotice({ type: "success", text: "Delivery address removed." });
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.detail || "Could not remove address." });
    } finally {
      setBusy(false);
    }
  };

  const uploadPrescription = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadingPrescription(true);
    setNotice(null);
    try {
      const response = await prescriptionsApi.upload(file);
      setPrescription({
        required: true,
        status: response.data.prescription.status,
        prescription: response.data.prescription,
      });
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.detail || "Could not upload prescription.",
      });
    } finally {
      setUploadingPrescription(false);
    }
  };

  const placeOrder = async () => {
    if (!selectedAddress) {
      setNotice({ type: "error", text: "Select or add a delivery address." });
      return;
    }
    if (prescription.required && prescription.status !== "approved") {
      setNotice({
        type: "error",
        text:
          prescription.status === "pending"
            ? "Wait for the medicine seller to approve your prescription."
            : "Upload an approved prescription before checkout.",
      });
      return;
    }
    setBusy(true);
    setNotice(null);

    if (paymentMethod === "cod") {
      try {
        await ordersApi.create({ address_id: selectedAddress, payment_method: "cod" });
        navigate("/my-orders", { replace: true });
      } catch (error) {
        setNotice({ type: "error", text: error.response?.data?.detail || "Could not place order." });
        setBusy(false);
      }
      return;
    }

    if (!paymentConfig.configured) {
      setNotice({ type: "error", text: "Online payments are not configured yet." });
      setBusy(false);
      return;
    }

    try {
      const [paymentResponse] = await Promise.all([
        paymentsApi.createOrder(selectedAddress, paymentMethod),
        loadRazorpayCheckout(),
      ]);
      const paymentOrder = paymentResponse.data;
      const user = getStoredUser();

      const checkout = new window.Razorpay({
        key: paymentOrder.key_id,
        amount: paymentOrder.order.amount,
        currency: paymentOrder.order.currency,
        order_id: paymentOrder.order.id,
        name: "Bazario",
        description: `${paymentLabels[paymentMethod]} payment`,
        prefill: {
          name: user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" "),
          email: user?.email || "",
          contact: user?.phone || "",
        },
        method: {
          upi: paymentMethod === "upi",
          card: paymentMethod === "card",
          netbanking: false,
          wallet: false,
          paylater: false,
        },
        theme: { color: "#6938ef" },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setNotice({ type: "error", text: "Payment was cancelled. Your cart is unchanged." });
          },
        },
        handler: async (result) => {
          try {
            await paymentsApi.verifyPayment(result);
            navigate("/my-orders", { replace: true });
          } catch (error) {
            setNotice({
              type: "error",
              text: error.response?.data?.detail || "Payment could not be verified. Do not pay again; contact support.",
            });
            setBusy(false);
          }
        },
      });

      checkout.on("payment.failed", (result) => {
        setNotice({
          type: "error",
          text: result.error?.description || "Payment failed. Try another method.",
        });
        setBusy(false);
      });
      checkout.open();
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.detail || error.message || "Could not start payment.",
      });
      setBusy(false);
    }
  };

  return (
    <div className="store-page">
      <Navbar />
      <main className="store-shell">
        <section className="checkout-hero">
          <div>
            <p className="store-eyebrow">Checkout</p>
            <h1>Choose how your order reaches you.</h1>
            <p>Confirm delivery, then pay securely by UPI or card, or choose cash on delivery.</p>
          </div>
          <div className="checkout-hero__step">{paymentMethod.toUpperCase()}</div>
        </section>

        {notice && <div className={`store-alert store-alert--${notice.type} checkout-alert`}>{notice.text}</div>}
        {loading && <div className="store-state">Preparing checkout...</div>}

        {!loading && items.length === 0 && (
          <div className="orders-empty">
            <MapPin size={34} />
            <h2>Your cart is empty</h2>
            <p>Add products before choosing delivery details.</p>
            <button className="store-button" type="button" onClick={() => navigate("/products")}>
              Browse products <ArrowRight size={16} />
            </button>
          </div>
        )}

        {!loading && items.length > 0 && (
          <section className="checkout-grid">
            <div className="store-list">
              <article className="store-card checkout-section">
                <header className="checkout-section__header">
                  <div>
                    <p className="store-eyebrow">Step 01</p>
                    <h2>Delivery address</h2>
                    <p>Select a saved address or add another.</p>
                  </div>
                  <button
                    className="store-button store-button--ghost"
                    type="button"
                    onClick={() => {
                      setEditingAddressId("");
                      setAddress(initialAddress);
                      setShowForm((current) => !current);
                    }}
                  >
                    <Plus size={16} /> {showForm ? "Cancel" : "Add address"}
                  </button>
                </header>

                <div className="store-list">
                  {addresses.map((item) => (
                    <div className={`address-option ${selectedAddress === item._id ? "is-selected" : ""}`} key={item._id}>
                      <label>
                        <input checked={selectedAddress === item._id} name="address" type="radio" onChange={() => setSelectedAddress(item._id)} />
                        <span>
                          <strong>{item.full_name}</strong>
                          <small>{item.phone}</small>
                          {item.address_line}, {item.city}, {item.state} {item.pincode}
                        </span>
                      </label>
                      <div className="address-option__actions">
                        <button aria-label="Edit address" type="button" onClick={() => editAddress(item)}>
                          <Pencil size={15} /> Edit
                        </button>
                        <button aria-label="Remove address" type="button" onClick={() => removeAddress(item)}>
                          <Trash2 size={15} /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {addresses.length === 0 && !showForm && <div className="store-state">Add an address to continue.</div>}
                </div>
              </article>

              {showForm && (
                <form className="store-card store-form checkout-section" onSubmit={saveAddress}>
                  <p className="store-eyebrow">{editingAddressId ? "Edit address" : "New address"}</p>
                  <h2>{editingAddressId ? "Update delivery details" : "Delivery details"}</h2>
                  <div className="store-form__row">
                    <label className="store-field">Full name<input className="store-input" name="full_name" required value={address.full_name} onChange={updateAddress} /></label>
                    <label className="store-field">Phone<input className="store-input" name="phone" required value={address.phone} onChange={updateAddress} /></label>
                  </div>
                  <label className="store-field">Address<input className="store-input" name="address_line" required value={address.address_line} onChange={updateAddress} /></label>
                  <div className="store-form__row">
                    <label className="store-field">City<input className="store-input" name="city" required value={address.city} onChange={updateAddress} /></label>
                    <label className="store-field">State<input className="store-input" name="state" required value={address.state} onChange={updateAddress} /></label>
                  </div>
                  <label className="store-field">Pincode<input className="store-input" name="pincode" required value={address.pincode} onChange={updateAddress} /></label>
                  <button className="store-button" disabled={busy} type="submit">
                    {busy ? "Saving..." : editingAddressId ? "Update address" : "Save address"}
                  </button>
                </form>
              )}

              {prescription.required && (
                <article className="store-card checkout-section prescription-checkout">
                  <header className="checkout-section__header">
                    <div>
                      <p className="store-eyebrow">Health verification</p>
                      <h2>Prescription required</h2>
                      <p>Upload a clear JPG, PNG, or PDF. Maximum size is 5 MB.</p>
                    </div>
                    <FileCheck2 aria-hidden="true" size={28} />
                  </header>

                  <div className={`prescription-status prescription-status--${prescription.status}`}>
                    <strong>
                      {prescription.status === "approved" && "Approved"}
                      {prescription.status === "pending" && "Waiting for seller review"}
                      {prescription.status === "rejected" && "Rejected - upload a new prescription"}
                      {prescription.status === "missing" && "No prescription uploaded"}
                    </strong>
                    {prescription.prescription?.filename && (
                      <span>{prescription.prescription.filename}</span>
                    )}
                  </div>

                  {prescription.status !== "approved" && (
                    <label className="prescription-upload">
                      <FileUp size={18} />
                      {uploadingPrescription ? "Uploading..." : "Upload prescription"}
                      <input
                        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                        disabled={uploadingPrescription}
                        type="file"
                        onChange={uploadPrescription}
                      />
                    </label>
                  )}
                </article>
              )}

              <article className="store-card checkout-section">
                <header className="checkout-section__header">
                  <div>
                    <p className="store-eyebrow">Step 02</p>
                    <h2>Payment method</h2>
                    <p>Select how you would like to pay.</p>
                  </div>
                  <ShieldCheck aria-hidden="true" size={28} />
                </header>

                <div className="payment-options">
                  <label className={`payment-option ${paymentMethod === "cod" ? "is-selected" : ""}`}>
                    <input checked={paymentMethod === "cod"} name="payment" type="radio" onChange={() => setPaymentMethod("cod")} />
                    <span className="payment-option__icon"><Banknote size={22} /></span>
                    <span className="payment-option__copy">
                      <strong>Cash on delivery</strong>
                      <small>Pay when your order arrives</small>
                    </span>
                  </label>

                  <label className={`payment-option ${paymentMethod === "upi" ? "is-selected" : ""} ${!paymentConfig.configured ? "is-disabled" : ""}`}>
                    <input checked={paymentMethod === "upi"} disabled={!paymentConfig.configured} name="payment" type="radio" onChange={() => setPaymentMethod("upi")} />
                    <span className="payment-option__icon"><Smartphone size={22} /></span>
                    <span className="payment-option__copy">
                      <strong>UPI</strong>
                      <small>Google Pay, PhonePe, Paytm, BHIM and other UPI apps</small>
                    </span>
                    <span className="payment-option__tag">Instant</span>
                  </label>

                  <label className={`payment-option ${paymentMethod === "card" ? "is-selected" : ""} ${!paymentConfig.configured ? "is-disabled" : ""}`}>
                    <input checked={paymentMethod === "card"} disabled={!paymentConfig.configured} name="payment" type="radio" onChange={() => setPaymentMethod("card")} />
                    <span className="payment-option__icon"><CreditCard size={22} /></span>
                    <span className="payment-option__copy">
                      <strong>Credit or debit card</strong>
                      <small>Visa, Mastercard, RuPay and supported cards</small>
                    </span>
                    <span className="payment-option__tag">Secure</span>
                  </label>
                </div>

                {!paymentConfig.configured && (
                  <p className="payment-setup-note">
                    {paymentConfig.setup_message || "Online payments need valid Razorpay keys."} Cash on delivery is available now.
                  </p>
                )}
              </article>
            </div>

            <aside className="checkout-summary">
              <p className="store-eyebrow">Step 03</p>
              <h2>Order summary</h2>
              {items.map((item) => (
                <div className="summary-row" key={item._id}>
                  <span>
                    {item.product_name}
                    {formatOptions(item) ? ` | ${formatOptions(item)}` : ""}
                    {` x ${item.quantity}`}
                  </span>
                  <strong>{formatCurrency(item.price * item.quantity)}</strong>
                </div>
              ))}
              <div className="summary-row"><span>Items</span><strong>{itemCount}</strong></div>
              <div className="summary-row"><span>Payment</span><strong>{paymentLabels[paymentMethod]}</strong></div>
              <div className="summary-row summary-row--total"><span>Total</span><span>{formatCurrency(total)}</span></div>
              <button
                className="store-button checkout-summary__button"
                disabled={busy || !selectedAddress || (prescription.required && prescription.status !== "approved")}
                type="button"
                onClick={placeOrder}
              >
                {busy ? "Processing..." : paymentMethod === "cod" ? "Place order" : `Pay ${formatCurrency(total)}`} <ArrowRight size={16} />
              </button>
            </aside>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default Checkout;
