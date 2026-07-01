import {
  ArrowRight,
  CalendarDays,
  Download,
  MapPin,
  MessageSquareWarning,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { ordersApi } from "../services/api";
import "./Storefront.css";

const orderSteps = ["Processing", "Packed", "Shipped", "Out for delivery", "Delivered"];
const paymentLabels = {
  cod: "Cash on delivery",
  upi: "UPI",
  card: "Credit or debit card",
};
const returnReasons = [
  ["damaged", "Damaged product"],
  ["wrong_item", "Wrong item received"],
  ["quality", "Quality issue"],
  ["size_fit", "Size or fit issue"],
  ["changed_mind", "Changed my mind"],
  ["other", "Other reason"],
];

function formatOptions(product) {
  const values = Object.values(product.selected_options || {});
  if (values.length) return values.join(" | ");
  return [product.selected_size && `Size ${product.selected_size}`, product.selected_color]
    .filter(Boolean)
    .join(" | ");
}

function getProductReturnKey(product) {
  const selectedOptions = product.selected_options || {};
  const optionBits = Object.entries(selectedOptions)
    .sort(([first], [second]) => first.localeCompare(second))
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}:${value}`);
  const optionText = optionBits.length
    ? optionBits.join("|")
    : `size:${product.selected_size || ""}|color:${product.selected_color || ""}`;
  return `${product.product_id}::${optionText}`;
}

function getReturnedProductKeys(order) {
  return new Set(
    (order.return_requests || [])
      .filter((request) => request.status !== "rejected")
      .flatMap((request) => request.products || [])
      .map(getProductReturnKey)
  );
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function statusClass(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "-");
}

function getNextStep(status) {
  const index = orderSteps.indexOf(status);
  if (index < 0 || index >= orderSteps.length - 1) return null;
  return orderSteps[index + 1];
}

function getStatusMessage(order) {
  if (order.order_status === "Cancelled") return "This order was cancelled.";
  if (order.order_status === "Delivered") return "Delivered. You can download the invoice or request support if needed.";
  const nextStep = getNextStep(order.order_status);
  if (order.shipments?.length) {
    return `Tracking is active. Next update: ${nextStep || "delivery completion"}.`;
  }
  return nextStep
    ? `Your order is moving forward. Next update: ${nextStep}.`
    : "We will show the next delivery update here.";
}

function isWithinReturnWindow(order) {
  const deliveredAt = new Date(order.delivered_at || order.created_at);
  if (Number.isNaN(deliveredAt.getTime())) return false;
  return Date.now() <= deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000;
}

function MyOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [returningId, setReturningId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [returnDrafts, setReturnDrafts] = useState({});

  const loadOrders = useCallback(() => {
    setLoading(true);
    ordersApi.getAll()
      .then((response) => {
        setOrders(response.data.orders || []);
        setError("");
      })
      .catch((requestError) => setError(requestError.response?.data?.detail || "Could not load orders."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const orderStats = useMemo(() => ({
    active: orders.filter((order) => !["Delivered", "Cancelled"].includes(order.order_status)).length,
    delivered: orders.filter((order) => order.order_status === "Delivered").length,
    returns: orders.filter((order) => Boolean(order.return_status)).length,
    disputes: orders.filter((order) => Boolean(order.dispute)).length,
  }), [orders]);

  const sortedOrders = [...orders]
    .filter((order) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "returns") return Boolean(order.return_status);
      if (statusFilter === "disputes") return Boolean(order.dispute);
      return order.order_status === statusFilter;
    })
    .sort((first, second) => new Date(second.created_at) - new Date(first.created_at));

  const focusOrder = sortedOrders.find((order) => !["Delivered", "Cancelled"].includes(order.order_status)) || sortedOrders[0];

  const cancelOrder = async (order) => {
    const confirmed = window.confirm(
      "Cancel this order? Reserved stock will be released and paid orders will be refunded."
    );
    if (!confirmed) return;

    setCancellingId(order._id);
    setError("");
    setNotice("");
    try {
      const response = await ordersApi.cancel(order._id);
      setOrders((current) =>
        current.map((item) => item._id === order._id ? response.data.order : item)
      );
      setNotice(response.data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not cancel the order.");
    } finally {
      setCancellingId("");
    }
  };

  const updateReturnDraft = (orderId, values) => {
    setReturnDrafts((current) => ({
      ...current,
      [orderId]: {
        reason_category: "quality",
        reason: "",
        product_keys: [],
        ...(current[orderId] || {}),
        ...values,
      },
    }));
  };

  const toggleReturnProduct = (orderId, productKey) => {
    const draft = returnDrafts[orderId] || { product_keys: [] };
    const currentKeys = new Set(draft.product_keys || []);
    if (currentKeys.has(productKey)) {
      currentKeys.delete(productKey);
    } else {
      currentKeys.add(productKey);
    }
    updateReturnDraft(orderId, { product_keys: Array.from(currentKeys) });
  };

  const requestReturn = async (order) => {
    const draft = returnDrafts[order._id] || {};
    const productKeys = draft.product_keys || [];
    if (productKeys.length === 0) {
      setError("Select at least one product to return.");
      return;
    }
    if (!draft.reason?.trim() || draft.reason.trim().length < 10) {
      setError("Return details must contain at least 10 characters.");
      return;
    }

    setReturningId(order._id);
    setError("");
    setNotice("");
    try {
      const response = await ordersApi.requestReturn(order._id, {
        product_keys: productKeys,
        reason_category: draft.reason_category || "quality",
        reason: draft.reason.trim(),
      });
      setOrders((current) =>
        current.map((item) => item._id === order._id ? response.data.order : item)
      );
      setReturnDrafts((current) => ({ ...current, [order._id]: undefined }));
      setNotice(response.data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not request a return.");
    } finally {
      setReturningId("");
    }
  };

  const downloadInvoice = async (order) => {
    setBusyAction(`invoice-${order._id}`);
    setError("");
    try {
      const response = await ordersApi.downloadInvoice(order._id);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bazario-invoice-${order._id.slice(-8).toUpperCase()}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not download the invoice.");
    } finally {
      setBusyAction("");
    }
  };

  const openDispute = async (order) => {
    const category = window.prompt(
      "Dispute category: delivery, return, refund, product, or other",
      order.payment_status === "refund_pending" ? "refund" : "delivery"
    );
    if (category === null) return;
    const normalizedCategory = category.trim().toLowerCase();
    if (!["delivery", "return", "refund", "product", "other"].includes(normalizedCategory)) {
      setError("Choose delivery, return, refund, product, or other.");
      return;
    }
    const reason = window.prompt("Explain the issue in at least 15 characters.");
    if (reason === null) return;
    if (reason.trim().length < 15) {
      setError("Dispute details must contain at least 15 characters.");
      return;
    }

    setBusyAction(`dispute-${order._id}`);
    setError("");
    setNotice("");
    try {
      const response = await ordersApi.openDispute(order._id, normalizedCategory, reason.trim());
      setOrders((current) =>
        current.map((item) =>
          item._id === order._id ? { ...item, dispute: response.data.dispute } : item
        )
      );
      setNotice(response.data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not submit the dispute.");
    } finally {
      setBusyAction("");
    }
  };

  const copyTracking = async (shipment) => {
    setError("");
    setNotice("");
    const trackingText = `${shipment.carrier}: ${shipment.tracking_number}`;
    try {
      await navigator.clipboard.writeText(trackingText);
      setNotice("Tracking number copied.");
    } catch {
      setNotice(trackingText);
    }
  };

  return (
    <div className="store-page">
      <Navbar />
      <main className="store-shell">
        <section className="orders-hero">
          <div>
            <p className="store-eyebrow">Order desk</p>
            <h1>Track every Bazario order clearly.</h1>
            <p>See your order status, item totals, and delivery progress from one polished dashboard.</p>
          </div>
          <div className="orders-hero__card">
            <PackageCheck size={28} />
            <strong>{orders.length}</strong>
            <span>Total orders</span>
            <button type="button" onClick={loadOrders} disabled={loading}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </section>

        {loading && <div className="store-state">Loading orders...</div>}
        {error && <div className="store-alert store-alert--error">{error}</div>}
        {notice && <div className="store-alert store-alert--success">{notice}</div>}

        {!loading && orders.length > 0 && (
          <section className="order-command-center" aria-label="Order command center">
            <article>
              <Truck size={20} />
              <span>Active</span>
              <strong>{orderStats.active}</strong>
            </article>
            <article>
              <ShieldCheck size={20} />
              <span>Delivered</span>
              <strong>{orderStats.delivered}</strong>
            </article>
            <article>
              <RotateCcw size={20} />
              <span>Returns</span>
              <strong>{orderStats.returns}</strong>
            </article>
            <article>
              <MessageSquareWarning size={20} />
              <span>Issues</span>
              <strong>{orderStats.disputes}</strong>
            </article>
            {focusOrder && (
              <div className="order-focus-card">
                <p className="store-eyebrow">Current focus</p>
                <strong>Order #{focusOrder._id.slice(-8).toUpperCase()}</strong>
                <span>{getStatusMessage(focusOrder)}</span>
              </div>
            )}
          </section>
        )}

        {!loading && orders.length > 0 && (
          <div className="order-filters" aria-label="Filter orders">
            {[
              ["all", "All"],
              ["Processing", "Processing"],
              ["Packed", "Packed"],
              ["Shipped", "Shipped"],
              ["Out for delivery", "Out for delivery"],
              ["Delivered", "Delivered"],
              ["Cancelled", "Cancelled"],
              ["returns", "Returns"],
              ["disputes", "Disputes"],
            ].map(([value, label]) => (
              <button
                className={statusFilter === value ? "is-active" : ""}
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="orders-empty">
            <ShoppingBag size={34} />
            <h2>No orders yet</h2>
            <p>Your order history will appear here after checkout.</p>
            <button className="store-button" type="button" onClick={() => navigate("/products")}>
              Start shopping <ArrowRight size={16} />
            </button>
          </div>
        )}

        {!loading && !error && orders.length > 0 && sortedOrders.length === 0 && (
          <div className="store-state">No orders match this filter.</div>
        )}

        {!loading && !error && sortedOrders.length > 0 && (
          <section className="orders-list" aria-label="Your orders">
            {sortedOrders.map((order) => {
              const activeStep = Math.max(0, orderSteps.indexOf(order.order_status));
              const returnedProductKeys = getReturnedProductKeys(order);
              const returnableProducts = order.products.filter(
                (product) => !returnedProductKeys.has(getProductReturnKey(product))
              );
              const returnDraft = returnDrafts[order._id] || {
                reason_category: "quality",
                reason: "",
                product_keys: [],
              };
              const timeline = order.status_history?.length
                ? order.status_history
                : orderSteps.slice(0, activeStep + 1).map((step, index) => ({
                    status: step,
                    label:
                      step === "Processing"
                        ? "Order confirmed"
                        : step === "Packed"
                          ? "Order packed"
                          : step === "Shipped"
                            ? "Shipment is on the way"
                            : step === "Out for delivery"
                              ? "Out for delivery"
                              : "Order delivered",
                    timestamp: index === 0 ? order.created_at : null,
                  }));

              return (
                <article className="order-card" key={order._id}>
                  <header className="order-card__header">
                    <div>
                      <p className="store-eyebrow">Order #{order._id.slice(-8).toUpperCase()}</p>
                      <h2>{formatDate(order.created_at)}</h2>
                    </div>
                    <span className={`order-status order-status--${statusClass(order.order_status)}`}>
                      {order.order_status}
                    </span>
                  </header>

                  {order.order_status === "Cancelled" ? (
                    <div className="order-cancelled-note">
                      <XCircle size={18} />
                      <span>
                        Order cancelled
                        {order.payment_status === "refunded" && " | Payment refunded"}
                        {order.payment_status === "refund_pending" && " | Refund processing"}
                      </span>
                    </div>
                  ) : (
                    <div className="order-tracking">
                      <div className="order-live-note">
                        <Truck size={18} />
                        <span>{getStatusMessage(order)}</span>
                      </div>
                      <div className="order-progress" aria-label={`Order status is ${order.order_status}`}>
                        {orderSteps.map((step, index) => (
                          <span className={index <= activeStep ? "is-complete" : ""} key={step}>
                            {step}
                          </span>
                        ))}
                      </div>
                      <div className="order-timeline">
                        {timeline.map((event, index) => (
                          <div className="is-complete" key={`${event.status}-${event.timestamp || index}`}>
                            <span />
                            <p>
                              <strong>{event.label || event.status}</strong>
                              <small>{event.timestamp ? formatDate(event.timestamp) : "Update pending"}</small>
                            </p>
                          </div>
                        ))}
                        {!["Delivered", "Cancelled"].includes(order.order_status) && (
                          <div>
                            <span />
                            <p>
                              <strong>Estimated delivery</strong>
                              <small>{formatDate(order.estimated_delivery)}</small>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {order.shipments?.length > 0 && (
                    <div className="order-shipments">
                      {order.shipments.map((shipment) => (
                        <article key={shipment.seller}>
                          <Truck size={18} />
                          <div>
                            <strong>{shipment.carrier}</strong>
                            <span>Tracking: {shipment.tracking_number}</span>
                            <small>
                              Sold by {shipment.seller || "Bazario seller"} | Expected {formatDate(shipment.estimated_delivery)}
                            </small>
                            <button type="button" onClick={() => copyTracking(shipment)}>
                              Copy tracking
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                  {!order.shipments?.length && !["Delivered", "Cancelled"].includes(order.order_status) && (
                    <div className="order-estimate">
                      <CalendarDays size={17} />
                      Estimated delivery: {formatDate(order.estimated_delivery)}
                    </div>
                  )}

                  <section className="order-delivery-card" aria-label="Delivery and payment details">
                    <article>
                      <MapPin size={18} />
                      <div>
                        <strong>Delivery address</strong>
                        <span>
                          {[
                            order.delivery_address?.full_name,
                            order.delivery_address?.phone,
                            order.delivery_address?.address_line,
                            order.delivery_address?.city,
                            order.delivery_address?.state,
                            order.delivery_address?.pincode,
                          ].filter(Boolean).join(", ") || "Saved delivery address"}
                        </span>
                      </div>
                    </article>
                    <article>
                      <Truck size={18} />
                      <div>
                        <strong>Payment and delivery</strong>
                        <span>
                          {paymentLabels[order.payment_method] || "Payment"} | Expected {formatDate(order.estimated_delivery)}
                        </span>
                      </div>
                    </article>
                  </section>

                  <div className="orders-products">
                    {order.products.map((product) => (
                      <div className="order-product" key={`${product.product_id}-${formatOptions(product) || "standard"}`}>
                        <div className="order-product__mark" />
                        <div>
                          <h3>{product.name}</h3>
                          <p>
                            {formatOptions(product) ? `${formatOptions(product)} | ` : ""}
                            Quantity {product.quantity} | Sold by {product.seller || "Bazario seller"}
                          </p>
                        </div>
                        <strong>{formatCurrency(product.price * product.quantity)}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="order-card__total">
                    <div className="order-payment">
                      <span>{paymentLabels[order.payment_method] || "Payment"}</span>
                      <small>
                        {order.order_status === "Cancelled" && order.payment_status === "pending"
                          ? "No payment due"
                          : order.payment_status === "refunded"
                            ? "Payment refunded"
                            : order.payment_status === "refund_pending"
                              ? "Refund processing"
                              : order.payment_status === "return_completed"
                                ? "Return completed"
                              : order.payment_status === "paid"
                                ? "Paid securely"
                                : "Payment due on delivery"}
                      </small>
                    </div>
                    <strong>{formatCurrency(order.total_amount)}</strong>
                  </div>
                  {order.order_status === "Processing" && (
                    <button
                      className="order-cancel-button"
                      disabled={cancellingId === order._id}
                      type="button"
                      onClick={() => cancelOrder(order)}
                    >
                      <XCircle size={16} />
                      {cancellingId === order._id ? "Cancelling..." : "Cancel order"}
                    </button>
                  )}
                  {order.order_status === "Delivered" && isWithinReturnWindow(order) && returnableProducts.length > 0 && (
                    <section className="order-return-form">
                      <header>
                        <div>
                          <p className="store-eyebrow">Product return</p>
                          <h3>Select the exact item you want to return</h3>
                        </div>
                        <RotateCcw size={18} />
                      </header>
                      <div className="order-return-products">
                        {returnableProducts.map((product) => {
                          const productKey = getProductReturnKey(product);
                          return (
                            <label key={productKey}>
                              <input
                                checked={(returnDraft.product_keys || []).includes(productKey)}
                                type="checkbox"
                                onChange={() => toggleReturnProduct(order._id, productKey)}
                              />
                              <span>
                                <strong>{product.name}</strong>
                                <small>
                                  {formatOptions(product) ? `${formatOptions(product)} | ` : ""}
                                  Quantity {product.quantity} | {formatCurrency(product.price * product.quantity)}
                                </small>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="order-return-fields">
                        <label>
                          Reason
                          <select
                            value={returnDraft.reason_category}
                            onChange={(event) =>
                              updateReturnDraft(order._id, { reason_category: event.target.value })
                            }
                          >
                            {returnReasons.map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Details
                          <textarea
                            placeholder="Tell the seller what happened. Add at least 10 characters."
                            value={returnDraft.reason}
                            onChange={(event) =>
                              updateReturnDraft(order._id, { reason: event.target.value })
                            }
                          />
                        </label>
                      </div>
                      <button
                        className="order-return-button"
                        disabled={returningId === order._id}
                        type="button"
                        onClick={() => requestReturn(order)}
                      >
                        <RotateCcw size={16} />
                        {returningId === order._id ? "Sending request..." : "Submit return request"}
                      </button>
                    </section>
                  )}
                  {order.return_status && (
                    <section className={`order-return-state order-return-state--${order.return_status}`}>
                      <header>
                        <RotateCcw size={16} />
                        <span>
                          Return {order.return_status.replace("_", " ")}
                          {order.payment_status === "refund_pending" && " | Refund processing"}
                          {order.payment_status === "refunded" && " | Refunded"}
                        </span>
                      </header>
                      <div className="order-return-timeline">
                        {(order.return_requests || []).map((request) => (
                          <article key={`${request.seller}-${request.requested_at}`}>
                            <strong>{request.seller}</strong>
                            <small>{request.reason_category?.replace("_", " ") || "Return request"}</small>
                            <p>{request.reason}</p>
                            <div>
                              {(request.history || []).map((event) => (
                                <span key={`${event.status}-${event.timestamp}`}>
                                  {event.label || event.status} · {formatDate(event.timestamp)}
                                </span>
                              ))}
                            </div>
                            <ul>
                              {(request.products || []).map((product) => (
                                <li key={getProductReturnKey(product)}>
                                  {product.name} · {formatOptions(product) || "Standard"} · Qty {product.quantity}
                                </li>
                              ))}
                            </ul>
                            {request.seller_note && <em>Seller note: {request.seller_note}</em>}
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                  {order.dispute && (
                    <div className={`order-dispute-state order-dispute-state--${order.dispute.status}`}>
                      <MessageSquareWarning size={16} />
                      <span>
                        Dispute {order.dispute.status.replace("_", " ")}
                        {order.dispute.admin_note && ` | ${order.dispute.admin_note}`}
                      </span>
                    </div>
                  )}
                  <div className="order-card__actions">
                    <button
                      className="order-secondary-button"
                      disabled={busyAction === `invoice-${order._id}`}
                      type="button"
                      onClick={() => downloadInvoice(order)}
                    >
                      <Download size={16} />
                      {busyAction === `invoice-${order._id}` ? "Preparing..." : "Download invoice"}
                    </button>
                    {!["open", "in_review"].includes(order.dispute?.status) && (
                      <button
                        className="order-secondary-button"
                        disabled={busyAction === `dispute-${order._id}`}
                        type="button"
                        onClick={() => openDispute(order)}
                      >
                        <MessageSquareWarning size={16} />
                        {busyAction === `dispute-${order._id}` ? "Submitting..." : "Report an issue"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default MyOrders;
