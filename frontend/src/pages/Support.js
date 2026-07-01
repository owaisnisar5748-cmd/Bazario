import { ArrowLeft, LifeBuoy, MessageCircle, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { ordersApi, supportApi } from "../services/api";
import "./Storefront.css";

const initialTicket = {
  subject: "",
  category: "order",
  order_id: "",
  message: "",
};

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function Support() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ticket, setTicket] = useState(initialTicket);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    Promise.allSettled([supportApi.getMine(), ordersApi.getAll()])
      .then(([ticketResult, orderResult]) => {
        if (ticketResult.status === "rejected") throw ticketResult.reason;
        setTickets(ticketResult.value.data.tickets || []);
        if (orderResult.status === "fulfilled") setOrders(orderResult.value.data.orders || []);
      })
      .catch((error) => setNotice({
        type: "error",
        text: error.response?.data?.detail || "Could not load support.",
      }))
      .finally(() => setLoading(false));
  }, []);

  const openTickets = useMemo(
    () => tickets.filter((item) => !["resolved", "closed"].includes(item.status)).length,
    [tickets]
  );

  const createTicket = async (event) => {
    event.preventDefault();
    setBusy("create");
    setNotice(null);
    try {
      const response = await supportApi.create(ticket);
      setTickets((current) => [response.data.ticket, ...current]);
      setTicket(initialTicket);
      setNotice({ type: "success", text: response.data.message });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.response?.data?.detail || "Could not create support ticket.",
      });
    } finally {
      setBusy("");
    }
  };

  const sendReply = async (ticketId) => {
    const message = (replyDrafts[ticketId] || "").trim();
    if (message.length < 2) return;
    setBusy(ticketId);
    try {
      const response = await supportApi.reply(ticketId, message);
      setTickets((current) =>
        current.map((item) =>
          item._id === ticketId
            ? {
                ...item,
                status: response.data.status,
                messages: [...item.messages, response.data.reply],
              }
            : item
        )
      );
      setReplyDrafts((current) => ({ ...current, [ticketId]: "" }));
    } catch (error) {
      setNotice({ type: "error", text: error.response?.data?.detail || "Could not send reply." });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="store-page">
      <Navbar />
      <main className="store-shell support-page">
        <section className="orders-hero support-hero">
          <div>
            <p className="store-eyebrow">Bazario support</p>
            <h1>Real help, connected to your account.</h1>
            <p>Ask about an order, payment, return, seller workspace, or account issue and keep every reply together.</p>
          </div>
          <div className="orders-hero__card">
            <LifeBuoy size={28} />
            <strong>{openTickets}</strong>
            <span>Open tickets</span>
          </div>
        </section>

        {notice && <div className={`store-alert store-alert--${notice.type}`}>{notice.text}</div>}

        <section className="support-grid">
          <form className="store-card support-form" onSubmit={createTicket}>
            <p className="store-eyebrow">New request</p>
            <h2>How can we help?</h2>
            <label className="store-field">
              Subject
              <input
                className="store-input"
                required
                minLength="5"
                value={ticket.subject}
                onChange={(event) => setTicket((current) => ({ ...current, subject: event.target.value }))}
              />
            </label>
            <div className="store-form__row">
              <label className="store-field">
                Category
                <select
                  className="store-select"
                  value={ticket.category}
                  onChange={(event) => setTicket((current) => ({ ...current, category: event.target.value }))}
                >
                  <option value="account">Account</option>
                  <option value="order">Order</option>
                  <option value="payment">Payment</option>
                  <option value="return">Return or refund</option>
                  <option value="seller">Seller workspace</option>
                  <option value="technical">Technical issue</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="store-field">
                Related order
                <select
                  className="store-select"
                  value={ticket.order_id}
                  onChange={(event) => setTicket((current) => ({ ...current, order_id: event.target.value }))}
                >
                  <option value="">No order</option>
                  {orders.map((order) => (
                    <option key={order._id} value={order._id}>
                      #{order._id.slice(-8).toUpperCase()} - {order.order_status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="store-field">
              Details
              <textarea
                className="store-textarea"
                required
                minLength="15"
                value={ticket.message}
                onChange={(event) => setTicket((current) => ({ ...current, message: event.target.value }))}
              />
            </label>
            <button className="store-button" disabled={busy === "create"} type="submit">
              <Plus size={16} /> {busy === "create" ? "Creating..." : "Create ticket"}
            </button>
          </form>

          <section className="support-list">
            <header>
              <div>
                <p className="store-eyebrow">Your conversations</p>
                <h2>Support history</h2>
              </div>
              <button className="store-button store-button--ghost" type="button" onClick={() => navigate(-1)}>
                <ArrowLeft size={16} /> Back
              </button>
            </header>

            {loading && <div className="store-state">Loading support tickets...</div>}
            {!loading && tickets.length === 0 && (
              <div className="store-state">No support tickets yet.</div>
            )}
            {tickets.map((item) => (
              <article className="support-ticket" key={item._id}>
                <header>
                  <div>
                    <span>{item.category}</span>
                    <h3>{item.subject}</h3>
                    <small>Updated {formatDate(item.updated_at)}</small>
                  </div>
                  <b>{item.status.replace("_", " ")}</b>
                </header>
                <div className="support-messages">
                  {item.messages.map((message, index) => (
                    <div className={`support-message support-message--${message.sender_role}`} key={`${message.created_at}-${index}`}>
                      <strong>{message.sender_role === "admin" ? "Bazario support" : "You"}</strong>
                      <p>{message.message}</p>
                      <small>{formatDate(message.created_at)}</small>
                    </div>
                  ))}
                </div>
                {item.status !== "closed" && (
                  <div className="support-reply">
                    <MessageCircle size={17} />
                    <input
                      placeholder="Write a reply..."
                      value={replyDrafts[item._id] || ""}
                      onChange={(event) => setReplyDrafts((current) => ({
                        ...current,
                        [item._id]: event.target.value,
                      }))}
                    />
                    <button disabled={busy === item._id} type="button" onClick={() => sendReply(item._id)}>
                      <Send size={16} /> Send
                    </button>
                  </div>
                )}
              </article>
            ))}
          </section>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default Support;
