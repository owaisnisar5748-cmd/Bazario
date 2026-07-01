import { Bell, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { notificationsApi } from "../services/api";
import "./Storefront.css";

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await notificationsApi.getAll(50);
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unread_count || 0);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const openNotification = async (notification) => {
    if (!notification.read) {
      await notificationsApi.markRead(notification._id);
      setNotifications((current) =>
        current.map((item) => item._id === notification._id ? { ...item, read: true } : item)
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    }
    if (notification.link) navigate(notification.link);
  };

  const markAllRead = async () => {
    await notificationsApi.markAllRead();
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
  };

  return (
    <div className="store-page">
      <Navbar />
      <main className="store-shell">
        <section className="notifications-hero">
          <div>
            <p className="store-eyebrow">Bazario inbox</p>
            <h1>Every important update, in one place.</h1>
            <p>Orders, returns, refunds, and prescription reviews appear here.</p>
          </div>
          <button disabled={!unreadCount} type="button" onClick={markAllRead}>
            <CheckCheck size={17} /> Mark all read
          </button>
        </section>

        {loading && <div className="store-state">Loading notifications...</div>}
        {error && <div className="store-alert store-alert--error">{error}</div>}

        {!loading && !error && notifications.length === 0 && (
          <div className="orders-empty">
            <Bell size={34} />
            <h2>Your inbox is clear</h2>
            <p>New marketplace updates will appear here.</p>
          </div>
        )}

        {!loading && notifications.length > 0 && (
          <section className="notifications-list">
            {notifications.map((notification) => (
              <button
                className={notification.read ? "" : "is-unread"}
                key={notification._id}
                type="button"
                onClick={() => openNotification(notification)}
              >
                <span className="notifications-list__icon"><Bell size={17} /></span>
                <span>
                  <strong>{notification.title}</strong>
                  <small>{notification.message}</small>
                </span>
                <time>{formatDate(notification.created_at)}</time>
              </button>
            ))}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default Notifications;
