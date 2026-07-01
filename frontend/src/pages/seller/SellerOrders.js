import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  FileText,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Truck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ordersApi, prescriptionsApi } from "../../services/api";
import "./SellerDashboard.css";

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update pending";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatOptions(product) {
  return Object.values(product.selected_options || {}).join(" | ");
}

const nextSellerStatus = {
  Processing: "Packed",
  Packed: "Shipped",
  Shipped: "Out for delivery",
  "Out for delivery": "Delivered",
};

const sellerStatusAction = {
  Processing: "Mark packed",
  Packed: "Mark shipped",
  Shipped: "Mark out for delivery",
  "Out for delivery": "Mark delivered",
};

const sellerSteps = ["Processing", "Packed", "Shipped", "Out for delivery", "Delivered"];

function SellerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [status, setStatus] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [shipmentDrafts, setShipmentDrafts] = useState({});
  const [orderFilter, setOrderFilter] = useState("all");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [orderResponse, prescriptionResponse] = await Promise.all([
        ordersApi.getSellerOrders(),
        prescriptionsApi.getSellerAll(),
      ]);
      setOrders(orderResponse.data.orders || []);
      setPrescriptions(prescriptionResponse.data.prescriptions || []);
      setStatus(null);
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not load seller orders." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const pendingReturns = useMemo(
    () => orders.filter((order) => order.seller_return?.status === "requested").length,
    [orders]
  );
  const pendingPrescriptions = useMemo(
    () => prescriptions.filter((item) => item.seller_review?.status === "pending").length,
    [prescriptions]
  );
  const visibleOrders = useMemo(
    () => orders.filter((order) => {
      if (orderFilter === "all") return true;
      if (orderFilter === "returns") return order.seller_return?.status === "requested";
      return order.order_status === orderFilter;
    }),
    [orderFilter, orders]
  );

  const advanceOrder = async (order) => {
    const nextStatus = nextSellerStatus[order.order_status];
    if (!nextStatus) return;
    setBusyId(order._id);
    try {
      let shipment = order.shipments?.[0];
      if (order.order_status === "Packed") {
        const draft = shipmentDrafts[order._id] || {};
        if (!draft.carrier?.trim() || !draft.tracking_number?.trim() || !draft.estimated_delivery) {
          setStatus({
            type: "error",
            text: "Add carrier, tracking number, and estimated delivery before shipping.",
          });
          return;
        }
        const shipmentResponse = await ordersApi.saveShipment(order._id, {
          carrier: draft.carrier.trim(),
          tracking_number: draft.tracking_number.trim(),
          estimated_delivery: draft.estimated_delivery,
        });
        shipment = shipmentResponse.data.shipment;
      }
      const statusResponse = await ordersApi.updateStatus(order._id, nextStatus);
      setOrders((current) =>
        current.map((item) =>
          item._id === order._id
            ? statusResponse.data.order || {
                ...item,
                order_status: nextStatus,
                shipments: shipment ? [shipment] : item.shipments,
              }
            : item
        )
      );
      setStatus({ type: "success", text: `Order marked ${nextStatus.toLowerCase()}.` });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not update order." });
    } finally {
      setBusyId("");
    }
  };

  const updateShipmentDraft = (orderId, field, value) => {
    setShipmentDrafts((current) => ({
      ...current,
      [orderId]: {
        ...current[orderId],
        [field]: value,
      },
    }));
  };

  const decideReturn = async (order, decision) => {
    const note = window.prompt(
      decision === "approve"
        ? "Approval note for the customer"
        : "Why are you rejecting this return?"
    );
    if (note === null) return;
    if (note.trim().length < 3) {
      setStatus({ type: "error", text: "Add a short seller note before deciding this return." });
      return;
    }

    setBusyId(order._id);
    try {
      const response = await ordersApi.decideReturn(order._id, decision, note.trim());
      setOrders((current) =>
        current.map((item) =>
          item._id === order._id
            ? {
                ...item,
                return_status: response.data.return_status,
                seller_return: {
                  ...item.seller_return,
                  status: decision === "approve" ? "approved" : "rejected",
                  seller_note: note.trim(),
                },
              }
            : item
        )
      );
      setStatus({ type: "success", text: response.data.message });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not review return." });
    } finally {
      setBusyId("");
    }
  };

  const viewPrescription = async (prescription) => {
    setBusyId(prescription._id);
    try {
      const response = await prescriptionsApi.getDocument(prescription._id);
      const url = URL.createObjectURL(response.data);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not open prescription." });
    } finally {
      setBusyId("");
    }
  };

  const decidePrescription = async (prescription, decision) => {
    const note = window.prompt(
      decision === "approve"
        ? "Optional prescription approval note"
        : "Why is this prescription invalid?"
    );
    if (note === null) return;

    setBusyId(prescription._id);
    try {
      const response = await prescriptionsApi.decide(prescription._id, decision, note);
      setPrescriptions((current) =>
        current.map((item) =>
          item._id === prescription._id
            ? {
                ...item,
                status: response.data.status,
                seller_review: {
                  ...item.seller_review,
                  status: decision === "approve" ? "approved" : "rejected",
                  note,
                },
              }
            : item
        )
      );
      setStatus({ type: "success", text: response.data.message });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not review prescription." });
    } finally {
      setBusyId("");
    }
  };

  return (
    <main className="seller-page">
      <nav className="seller-topbar">
        <button type="button" onClick={() => navigate("/seller-dashboard")}>
          <ArrowLeft size={17} /> Seller studio
        </button>
        <div>
          <button type="button" onClick={() => navigate("/notifications")}><Bell size={15} /> Alerts</button>
          <button type="button" onClick={loadOrders}><RefreshCw size={15} /> Refresh</button>
        </div>
      </nav>

      <section className="seller-section seller-orders-hero">
        <div>
          <p>Order operations</p>
          <h1>Fulfil orders. Review returns.</h1>
          <span>Move orders forward and make clear decisions on customer return requests.</span>
        </div>
        <div className="seller-orders-hero__stats">
          <article>
            <RotateCcw size={22} />
            <strong>{pendingReturns}</strong>
            <span>Returns waiting</span>
          </article>
          <article>
            <FileText size={22} />
            <strong>{pendingPrescriptions}</strong>
            <span>Prescriptions waiting</span>
          </article>
        </div>
      </section>

      {status && <div className={`seller-status seller-status--${status.type}`}>{status.text}</div>}
      {loading && <div className="seller-empty">Loading seller orders...</div>}

      {!loading && orders.length > 0 && (
        <div className="seller-order-filters" aria-label="Filter seller orders">
          {[
            ["all", "All orders"],
            ["Processing", "Processing"],
            ["Packed", "Packed"],
            ["Shipped", "Shipped"],
            ["Out for delivery", "Out for delivery"],
            ["Delivered", "Delivered"],
            ["returns", "Returns waiting"],
          ].map(([value, label]) => (
            <button
              className={orderFilter === value ? "is-active" : ""}
              key={value}
              type="button"
              onClick={() => setOrderFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="seller-empty">No customer orders yet.</div>
      )}

      {!loading && visibleOrders.length > 0 && (
        <section className="seller-orders-list">
          {visibleOrders.map((order) => (
            <article className="seller-order-card" key={order._id}>
              <header>
                <div>
                  <p>Order #{order._id.slice(-8).toUpperCase()}</p>
                  <h2>{order.order_status}</h2>
                </div>
                <strong>{formatCurrency(order.seller_total)}</strong>
              </header>

              <div className="seller-order-timeline" aria-label={`Seller fulfilment status is ${order.order_status}`}>
                {sellerSteps.map((step) => {
                  const activeIndex = sellerSteps.indexOf(order.order_status);
                  const event = (order.seller_status_history || []).find((item) => item.status === step);
                  return (
                    <span className={sellerSteps.indexOf(step) <= activeIndex ? "is-complete" : ""} key={step}>
                      <b>{step}</b>
                      <small>{event ? formatDate(event.timestamp) : "Pending"}</small>
                    </span>
                  );
                })}
              </div>

              <div className="seller-order-products">
                {order.products.map((product) => (
                  <div key={`${product.product_id}-${formatOptions(product)}`}>
                    <PackageCheck size={17} />
                    <span>
                      <strong>{product.name}</strong>
                      <small>
                        {formatOptions(product) ? `${formatOptions(product)} | ` : ""}
                        Quantity {product.quantity}
                      </small>
                    </span>
                    <b>{formatCurrency(product.price * product.quantity)}</b>
                  </div>
                ))}
              </div>

              {order.order_status === "Packed" && (
                <section className="seller-shipment-form">
                  <div>
                    <Truck size={18} />
                    <span>
                      <strong>Shipment details</strong>
                      <small>Required before this order can be marked shipped.</small>
                    </span>
                  </div>
                  <div className="seller-shipment-form__fields">
                    <label>
                      Carrier
                      <input
                        placeholder="Delhivery, Blue Dart..."
                        value={shipmentDrafts[order._id]?.carrier || ""}
                        onChange={(event) => updateShipmentDraft(order._id, "carrier", event.target.value)}
                      />
                    </label>
                    <label>
                      Tracking number
                      <input
                        placeholder="Shipment reference"
                        value={shipmentDrafts[order._id]?.tracking_number || ""}
                        onChange={(event) => updateShipmentDraft(order._id, "tracking_number", event.target.value)}
                      />
                    </label>
                    <label>
                      <CalendarDays size={14} /> Estimated delivery
                      <input
                        min={new Date().toISOString().slice(0, 10)}
                        type="date"
                        value={shipmentDrafts[order._id]?.estimated_delivery || ""}
                        onChange={(event) => updateShipmentDraft(order._id, "estimated_delivery", event.target.value)}
                      />
                    </label>
                  </div>
                </section>
              )}

              {order.shipments?.length > 0 && order.order_status !== "Packed" && (
                <section className="seller-shipment-summary">
                  <Truck size={18} />
                  <div>
                    <strong>{order.shipments[0].carrier}</strong>
                    <span>{order.shipments[0].tracking_number}</span>
                    <small>Expected {order.shipments[0].estimated_delivery}</small>
                  </div>
                </section>
              )}

              {order.seller_return && (
                <section className={`seller-return seller-return--${order.seller_return.status}`}>
                  <div>
                    <p>Return request · {order.seller_return.reason_category?.replace("_", " ") || "Product return"}</p>
                    <strong>{order.seller_return.reason}</strong>
                    <div className="seller-return-products">
                      {(order.seller_return.products || []).map((product) => (
                        <span key={`${product.product_id}-${formatOptions(product)}`}>
                          {product.name} · {formatOptions(product) || "Standard"} · Qty {product.quantity}
                        </span>
                      ))}
                    </div>
                    <div className="seller-return-timeline">
                      {(order.seller_return.history || []).map((event) => (
                        <small key={`${event.status}-${event.timestamp}`}>
                          {event.label || event.status} · {formatDate(event.timestamp)}
                        </small>
                      ))}
                    </div>
                    {order.seller_return.seller_note && <small>{order.seller_return.seller_note}</small>}
                  </div>
                  {order.seller_return.status === "requested" && (
                    <div className="seller-return__actions">
                      <button disabled={busyId === order._id} type="button" onClick={() => decideReturn(order, "approve")}>
                        <Check size={16} /> Approve
                      </button>
                      <button disabled={busyId === order._id} type="button" onClick={() => decideReturn(order, "reject")}>
                        <X size={16} /> Reject
                      </button>
                    </div>
                  )}
                </section>
              )}

              {nextSellerStatus[order.order_status] && (
                <button
                  className="seller-order-advance"
                  disabled={busyId === order._id}
                  type="button"
                  onClick={() => advanceOrder(order)}
                >
                  {busyId === order._id
                    ? "Updating..."
                    : sellerStatusAction[order.order_status]}
                </button>
              )}
            </article>
          ))}
        </section>
      )}

      {!loading && orders.length > 0 && visibleOrders.length === 0 && (
        <div className="seller-empty">No orders match this filter.</div>
      )}

      {!loading && prescriptions.length > 0 && (
        <section className="seller-section seller-prescriptions">
          <div className="seller-section__header">
            <p>Medicine safety</p>
            <h2>Prescription reviews</h2>
          </div>
          <div className="seller-prescription-list">
            {prescriptions.map((prescription) => (
              <article key={prescription._id}>
                <FileText size={21} />
                <div>
                  <strong>{prescription.filename}</strong>
                  <span>{prescription.username}</span>
                  <small>Status: {prescription.seller_review.status}</small>
                </div>
                <button disabled={busyId === prescription._id} type="button" onClick={() => viewPrescription(prescription)}>
                  View securely
                </button>
                {prescription.seller_review.status === "pending" && (
                  <div>
                    <button disabled={busyId === prescription._id} type="button" onClick={() => decidePrescription(prescription, "approve")}>
                      <Check size={15} /> Approve
                    </button>
                    <button disabled={busyId === prescription._id} type="button" onClick={() => decidePrescription(prescription, "reject")}>
                      <X size={15} /> Reject
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default SellerOrders;
