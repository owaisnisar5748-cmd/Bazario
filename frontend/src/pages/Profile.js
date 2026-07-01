import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  CreditCard,
  Heart,
  KeyRound,
  LifeBuoy,
  LogOut,
  Package,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, ordersApi, productsApi, wishlistApi } from "../services/api";
import { clearSession, getStoredUser, getUserRole, updateStoredUser } from "../services/auth";
import "./Profile.css";

const defaultUser = {
  name: "",
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  gender: "",
  role: "customer",
  preferences: {
    order_updates: true,
    account_alerts: true,
    marketplace_news: false,
    seller_activity: true,
  },
};

const customerMenuItems = [
  { id: "account", label: "Account", icon: User },
  { id: "orders", label: "Orders", icon: Package },
  { id: "wishlist", label: "Wishlist", icon: Heart },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "settings", label: "Settings", icon: Settings },
];

const sellerMenuItems = [
  { id: "account", label: "Seller profile", icon: Store },
  { id: "studio", label: "Studio", icon: Plus },
  { id: "listings", label: "Listings", icon: Boxes },
  { id: "inventory", label: "Inventory", icon: AlertTriangle },
  { id: "settings", label: "Seller settings", icon: Settings },
];

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function Profile() {
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState("account");
  const [user, setUser] = useState(defaultUser);
  const [status, setStatus] = useState(null);
  const [orders, setOrders] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [sellerProducts, setSellerProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [security, setSecurity] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const role = getUserRole(user);
  const isSeller = role === "seller";
  const menuItems = isSeller ? sellerMenuItems : customerMenuItems;

  const displayName = useMemo(() => {
    const fullName =
      user.name ||
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

    return fullName || (isSeller ? "Bazario Seller" : "Bazario Customer");
  }, [isSeller, user.firstName, user.lastName, user.name]);

  const initials = useMemo(() => {
    return displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }, [displayName]);

  const totalSpent = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
    [orders]
  );

  const totalSellerStock = useMemo(
    () => sellerProducts.reduce((sum, product) => sum + Number(product.stock || 0), 0),
    [sellerProducts]
  );

  const sellerInventoryValue = useMemo(
    () => sellerProducts.reduce(
      (sum, product) => sum + Number(product.price || 0) * Number(product.stock || 0),
      0
    ),
    [sellerProducts]
  );

  const lowStockProducts = useMemo(
    () => sellerProducts.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 5),
    [sellerProducts]
  );

  useEffect(() => {
    const storedUser = getStoredUser();

    if (!storedUser) {
      navigate("/login");
      return;
    }

    setUser((current) => ({
      ...current,
      ...storedUser,
      email: storedUser.email || storedUser.username || "",
      name:
        storedUser.name ||
        [storedUser.firstName, storedUser.lastName].filter(Boolean).join(" ").trim(),
    }));
  }, [navigate]);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser) return;

    if (getUserRole(storedUser) === "seller") {
      productsApi.getMine()
        .then((productResponse) => {
          setSellerProducts(productResponse.data.products || []);
        })
        .catch((error) => setStatus({ type: "error", text: error.response?.data?.detail || "Could not load seller activity." }));
      return;
    }

    Promise.all([ordersApi.getAll(), wishlistApi.getAll()])
      .then(([orderResponse, wishlistResponse]) => {
        setOrders(orderResponse.data.orders || []);
        setWishlist(wishlistResponse.data.wishlist || []);
      })
      .catch((error) => setStatus({ type: "error", text: error.response?.data?.detail || "Could not load account activity." }));
  }, []);

  const updateUser = (field, value) => {
    setUser((current) => ({
      ...current,
      [field]: value,
    }));
    setStatus(null);
  };

  const saveProfile = async () => {
    const nameParts = displayName.trim().split(/\s+/);
    const firstName = nameParts.shift() || user.firstName || "Bazario";
    const lastName = nameParts.join(" ") || user.lastName || firstName;

    setSaving(true);
    try {
      const response = await authApi.updateProfile({
        firstName,
        lastName,
        phone: user.phone || "",
        gender: user.gender || "",
        preferences: user.preferences || {},
      });
      const nextUser = response.data.user;
      updateStoredUser(nextUser);
      setUser((current) => ({ ...current, ...nextUser }));
      setStatus({ type: "success", text: "Profile saved successfully." });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not save profile." });
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    clearSession();
    navigate("/");
  };

  const removeWishlistItem = async (itemId) => {
    try {
      await wishlistApi.remove(itemId);
      setWishlist((current) => current.filter((item) => item._id !== itemId));
      setStatus({ type: "success", text: "Removed from wishlist." });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not remove wishlist item." });
    }
  };

  const renderAccount = () => (
    <section className="profile-section">
      <div className="profile-section__header">
        <p>{isSeller ? "Seller identity" : "Account details"}</p>
        <h2>{isSeller ? "Your seller information" : "Your personal information"}</h2>
        <span>
          {isSeller
            ? "These details identify your seller studio and help Bazario keep your account secure."
            : "These details help with orders, account recovery, and seller tools."}
        </span>
      </div>

      <div className="profile-form-grid">
        <label className="profile-field">
          <span>Full name</span>
          <input value={user.name} onChange={(event) => updateUser("name", event.target.value)} />
        </label>
        <label className="profile-field">
          <span>Email</span>
          <input readOnly value={user.email} />
        </label>
        <label className="profile-field">
          <span>Phone</span>
          <input value={user.phone} onChange={(event) => updateUser("phone", event.target.value)} />
        </label>
        <label className="profile-field">
          <span>Gender</span>
          <select value={user.gender} onChange={(event) => updateUser("gender", event.target.value)}>
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </label>
      </div>
    </section>
  );

  const renderSellerStudio = () => (
    <section className="profile-section profile-seller-panel">
      <div className="profile-section__header">
        <p>Seller studio</p>
        <h2>Your product workspace</h2>
        <span>Add listings, upload product images, manage category details, and keep stock fresh.</span>
      </div>
      <div className="profile-seller-actions">
        <button type="button" onClick={() => navigate("/seller-dashboard")}>
          <Plus size={18} /> Add new product
        </button>
        <button type="button" onClick={() => navigate("/products")}>
          <Store size={18} /> View marketplace
        </button>
      </div>
    </section>
  );

  const renderSellerListings = () => (
    <section className="profile-section">
      <div className="profile-section__header">
        <p>Listings</p>
        <h2>Your active products</h2>
        <span>A quick view of products owned by this seller account.</span>
      </div>
      <div className="profile-seller-listings">
        {sellerProducts.slice(0, 6).map((product) => (
          <article key={product._id}>
            <img src={product.image || product.images?.[0] || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=500&q=80"} alt={product.name} />
            <div>
              <strong>{product.name}</strong>
              <p>{formatCurrency(product.price)} / {product.stock || 0} in stock</p>
            </div>
            <button type="button" onClick={() => navigate(`/products/${product._id}`)}>
              <ArrowRight size={16} />
            </button>
          </article>
        ))}
        {sellerProducts.length === 0 && <p className="profile-muted">No seller products yet.</p>}
      </div>
      <button className="profile-inline-action" type="button" onClick={() => navigate("/seller-dashboard")}>
        Open seller dashboard
      </button>
    </section>
  );

  const renderSellerInventory = () => (
    <section className="profile-section">
      <div className="profile-section__header">
        <p>Inventory health</p>
        <h2>Stock needs attention</h2>
        <span>Products with low stock appear here so you can update them before they sell out.</span>
      </div>
      <div className="profile-list">
        {lowStockProducts.map((product) => (
          <article className="profile-list__item" key={product._id}>
            <div>
              <strong>{product.name}</strong>
              <p>{product.stock} units left</p>
            </div>
            <span>Low stock</span>
          </article>
        ))}
        {lowStockProducts.length === 0 && <p className="profile-muted">Inventory looks healthy.</p>}
      </div>
    </section>
  );

  const renderPayment = () => (
    <section className="profile-section profile-empty">
      <CreditCard size={34} />
      <h2>Payment is handled at checkout</h2>
      <p>Choose cash on delivery, UPI, or card at checkout. Bazario never stores your card or UPI credentials.</p>
      <button type="button" onClick={() => navigate("/cart")}>
        Go to cart
      </button>
    </section>
  );

  const updatePreference = (key, checked) => {
    setUser((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        [key]: checked,
      },
    }));
    setStatus(null);
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (security.newPassword.length < 8) {
      setStatus({ type: "error", text: "New password must contain at least 8 characters." });
      return;
    }
    if (security.newPassword !== security.confirmPassword) {
      setStatus({ type: "error", text: "New password confirmation does not match." });
      return;
    }

    setSaving(true);
    try {
      const response = await authApi.changePassword(
        security.currentPassword,
        security.newPassword
      );
      clearSession();
      navigate("/login", {
        replace: true,
        state: { message: response.data.message },
      });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not change password." });
    } finally {
      setSaving(false);
    }
  };

  const revokeSessions = async () => {
    if (!window.confirm("Sign out every active Bazario session, including this one?")) return;
    setSaving(true);
    try {
      await authApi.revokeSessions();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not revoke sessions." });
      setSaving(false);
    }
  };

  const renderSettings = () => (
    <section className="profile-section">
      <div className="profile-section__header">
      {isSeller ? <ShieldCheck size={34} /> : <Bell size={34} />}
      <h2>{isSeller ? "Seller preferences" : "Preferences"}</h2>
        <span>Choose which useful Bazario updates should appear in your account.</span>
      </div>
      <div className="profile-preferences">
        {[
          ["order_updates", "Order and delivery updates", "Shipment, delivery, return, and refund activity."],
          ["account_alerts", "Security and account alerts", "Important sign-in and account protection messages."],
          ["marketplace_news", "Marketplace news", "Occasional product and category announcements."],
          ...(isSeller
            ? [["seller_activity", "Seller activity", "New orders, returns, prescriptions, and stock notices."]]
            : []),
        ].map(([key, label, description]) => (
          <label key={key}>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <input
              checked={Boolean(user.preferences?.[key])}
              type="checkbox"
              onChange={(event) => updatePreference(key, event.target.checked)}
            />
          </label>
        ))}
      </div>
      <div className="profile-security">
        <div className="profile-section__header">
          <p>Account security</p>
          <h2>Protect your sign-in</h2>
          <span>Changing your password signs out every existing device and browser.</span>
        </div>
        <form onSubmit={changePassword}>
          <label className="profile-field">
            <span>Current password</span>
            <input
              autoComplete="current-password"
              required
              type="password"
              value={security.currentPassword}
              onChange={(event) => setSecurity((current) => ({
                ...current,
                currentPassword: event.target.value,
              }))}
            />
          </label>
          <label className="profile-field">
            <span>New password</span>
            <input
              autoComplete="new-password"
              minLength="8"
              required
              type="password"
              value={security.newPassword}
              onChange={(event) => setSecurity((current) => ({
                ...current,
                newPassword: event.target.value,
              }))}
            />
          </label>
          <label className="profile-field">
            <span>Confirm new password</span>
            <input
              autoComplete="new-password"
              minLength="8"
              required
              type="password"
              value={security.confirmPassword}
              onChange={(event) => setSecurity((current) => ({
                ...current,
                confirmPassword: event.target.value,
              }))}
            />
          </label>
          <button disabled={saving} type="submit">
            <KeyRound size={17} /> {saving ? "Updating..." : "Change password"}
          </button>
        </form>
        <div className="profile-security__actions">
          <button disabled={saving} type="button" onClick={revokeSessions}>
            <LogOut size={17} /> Sign out all devices
          </button>
          <button type="button" onClick={() => navigate("/support")}>
            <LifeBuoy size={17} /> Contact support
          </button>
        </div>
      </div>
    </section>
  );

  const renderOrders = () => (
    <section className="profile-section">
      <div className="profile-section__header">
        <p>Orders</p>
        <h2>Recent purchases</h2>
        <span>Your latest order activity and delivery status.</span>
      </div>
      <div className="profile-list">
        {orders.slice(0, 5).map((order) => (
          <article className="profile-list__item" key={order._id}>
            <div>
              <strong>Order #{order._id.slice(-8).toUpperCase()}</strong>
              <p>{order.products.map((item) => item.name).join(", ")}</p>
              <small>{formatCurrency(order.total_amount)} / {order.payment_method?.toUpperCase()}</small>
            </div>
            <span>{order.order_status}</span>
          </article>
        ))}
        {orders.length === 0 && <p className="profile-muted">No orders yet.</p>}
      </div>
      <button className="profile-inline-action" type="button" onClick={() => navigate("/my-orders")}>
        View all orders
      </button>
    </section>
  );

  const renderWishlist = () => (
    <section className="profile-section">
      <div className="profile-section__header">
        <p>Wishlist</p>
        <h2>Saved products</h2>
        <span>Keep track of products you want to revisit later.</span>
      </div>
      <div className="profile-list">
        {wishlist.map((item) => (
          <article className="profile-list__item" key={item._id}>
            <div>
              <strong>{item.product_name}</strong>
              <p>{formatCurrency(item.price)}</p>
            </div>
            <button type="button" onClick={() => removeWishlistItem(item._id)}>Remove</button>
          </article>
        ))}
        {wishlist.length === 0 && <p className="profile-muted">No saved products yet.</p>}
      </div>
    </section>
  );

  const renderActiveSection = () => {
    if (activeSection === "account") return renderAccount();
    if (isSeller && activeSection === "studio") return renderSellerStudio();
    if (isSeller && activeSection === "listings") return renderSellerListings();
    if (isSeller && activeSection === "inventory") return renderSellerInventory();
    if (activeSection === "payment") return renderPayment();
    if (activeSection === "settings") return renderSettings();
    if (activeSection === "orders") return renderOrders();
    return renderWishlist();
  };

  return (
    <main className={`profile-page ${isSeller ? "profile-page--seller" : ""}`}>
      <aside className="profile-sidebar">
        <button className="profile-home" type="button" onClick={() => navigate("/")}>
          Bazario
        </button>

        <div className="profile-identity">
          <div className="profile-avatar">{initials || <User size={34} />}</div>
          <h1>{displayName}</h1>
          <p>{user.email || "customer@email.com"}</p>
          <span>{isSeller ? "Seller profile" : "Customer account"}</span>
        </div>

        <nav className="profile-menu" aria-label="Profile sections">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                className={activeSection === item.id ? "is-active" : ""}
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
          <button className="profile-menu__logout" type="button" onClick={logout}>
            <LogOut size={18} />
            Logout
          </button>
        </nav>
      </aside>

      <section className="profile-content">
        <section className="profile-hero">
          <div>
            <p>My profile</p>
            <h2>{isSeller ? "Manage your seller profile." : "Manage your Bazario account."}</h2>
            <span>
              {isSeller
                ? "Track your listings, inventory health, and seller workspace from one focused profile."
                : "Update profile details, review recent orders, and keep saved products tidy."}
            </span>
          </div>
          <button className="profile-save" type="button" onClick={saveProfile} disabled={saving}>
            <Save size={18} />
            {saving ? "Saving..." : "Save changes"}
          </button>
        </section>

        <section className="profile-stats" aria-label="Account overview">
          {isSeller ? (
            <>
              <article><Store size={18} /><strong>{sellerProducts.length}</strong><span>Listings</span></article>
              <article><Boxes size={18} /><strong>{totalSellerStock}</strong><span>Units in stock</span></article>
              <article><ShoppingBag size={18} /><strong>{formatCurrency(sellerInventoryValue)}</strong><span>Inventory value</span></article>
            </>
          ) : (
            <>
              <article><Package size={18} /><strong>{orders.length}</strong><span>Orders</span></article>
              <article><Heart size={18} /><strong>{wishlist.length}</strong><span>Saved</span></article>
              <article><ShoppingBag size={18} /><strong>{formatCurrency(totalSpent)}</strong><span>Total ordered</span></article>
            </>
          )}
        </section>

        {status && <div className={`profile-status profile-status--${status.type}`}>{status.text}</div>}

        {renderActiveSection()}
      </section>
    </main>
  );
}

export default Profile;
