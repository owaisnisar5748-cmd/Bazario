import {
  Bell,
  ChevronDown,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { clearSession, getStoredUser, getUserRole } from "../services/auth";
import { notificationsApi } from "../services/api";
import "./Navbar.css";

const navItems = [
  { label: "Home", to: "/" },
  { label: "Marketplace", to: "/products" },
  { label: "Our story", to: "/about" },
];

function Navbar() {
  const navigate = useNavigate();
  const [loggedUser, setLoggedUser] = useState(null);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setLoggedUser(getStoredUser());
    const sessionExpired = () => {
      setLoggedUser(null);
      navigate("/login");
    };
    window.addEventListener("bazario:session-expired", sessionExpired);
    return () => window.removeEventListener("bazario:session-expired", sessionExpired);
  }, [navigate]);

  useEffect(() => {
    if (!loggedUser) {
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }

    let active = true;
    const loadNotifications = () => {
      notificationsApi.getAll(6)
        .then((response) => {
          if (!active) return;
          setNotifications(response.data.notifications || []);
          setUnreadCount(response.data.unread_count || 0);
        })
        .catch(() => {});
    };
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loggedUser]);

  const closeMenus = () => {
    setMenuOpen(false);
    setAccountOpen(false);
    setNotificationOpen(false);
  };

  const runSearch = (event) => {
    event.preventDefault();
    const query = search.trim();
    closeMenus();
    navigate(query ? `/products?search=${encodeURIComponent(query)}` : "/products");
  };

  const logout = () => {
    clearSession();
    setLoggedUser(null);
    closeMenus();
    navigate("/");
  };

  const openNotification = async (notification) => {
    if (!notification.read) {
      try {
        await notificationsApi.markRead(notification._id);
        setNotifications((current) =>
          current.map((item) => item._id === notification._id ? { ...item, read: true } : item)
        );
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch {
        return;
      }
    }
    closeMenus();
    if (notification.link) navigate(notification.link);
  };

  const displayName =
    loggedUser?.firstName || loggedUser?.name || loggedUser?.username || "Account";
  const userRole = getUserRole(loggedUser);
  const isCustomer = Boolean(loggedUser) && userRole === "customer";
  const isSeller = Boolean(loggedUser) && userRole === "seller";
  const isAdmin = Boolean(loggedUser) && userRole === "admin";

  return (
    <header className="bazario-nav">
      <div className="bazario-nav__inner">
        <Link className="bazario-nav__brand" to="/" onClick={closeMenus}>
          <span className="bazario-nav__monogram">B</span>
          <span className="bazario-nav__wordmark">
            <strong>Bazario</strong>
            <small>Curated marketplace</small>
          </span>
        </Link>

        <nav className="bazario-nav__links" aria-label="Primary navigation">
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) => `bazario-nav__link ${isActive ? "is-active" : ""}`}
              end={item.to === "/"}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <form className="bazario-nav__search" onSubmit={runSearch}>
          <Search size={16} />
          <input
            aria-label="Search products"
            placeholder="Find something worth keeping"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <kbd>↵</kbd>
        </form>

        <div className="bazario-nav__actions">
          {loggedUser && (
            <div className="bazario-nav__notifications">
              <button
                aria-label={`${unreadCount} unread notifications`}
                className="bazario-nav__icon-button"
                type="button"
                onClick={() => {
                  setNotificationOpen((current) => !current);
                  setAccountOpen(false);
                }}
              >
                <Bell size={19} />
                {unreadCount > 0 && <span className="bazario-nav__badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
              </button>
              {notificationOpen && (
                <div className="bazario-nav__notification-panel">
                  <header>
                    <strong>Notifications</strong>
                    <button type="button" onClick={() => { closeMenus(); navigate("/notifications"); }}>View all</button>
                  </header>
                  {notifications.length === 0 ? (
                    <p>No new updates.</p>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        className={notification.read ? "" : "is-unread"}
                        key={notification._id}
                        type="button"
                        onClick={() => openNotification(notification)}
                      >
                        <span />
                        <div>
                          <strong>{notification.title}</strong>
                          <small>{notification.message}</small>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {(!loggedUser || isCustomer) && (
            <button
              aria-label="Shopping cart"
              className="bazario-nav__icon-button"
              type="button"
              onClick={() => navigate("/cart")}
            >
              <ShoppingBag size={19} />
            </button>
          )}

          {!loggedUser ? (
            <div className="bazario-nav__guest">
              <button className="bazario-nav__text-button" type="button" onClick={() => navigate("/login")}>
                Sign in
              </button>
              <button className="bazario-nav__join" type="button" onClick={() => navigate("/register")}>
                <Sparkles size={15} />
                Join Bazario
              </button>
            </div>
          ) : (
            <div className="bazario-nav__account">
              <button
                aria-expanded={accountOpen}
                className="bazario-nav__account-trigger"
                type="button"
                onClick={() => setAccountOpen((current) => !current)}
              >
                <span className="bazario-nav__avatar">{displayName.charAt(0).toUpperCase()}</span>
                <span>
                  <small>{isAdmin ? "Admin control" : isSeller ? "Seller studio" : "Welcome back"}</small>
                  <strong>{displayName}</strong>
                </span>
                <ChevronDown className={accountOpen ? "is-open" : ""} size={16} />
              </button>

              {accountOpen && (
                <div className="bazario-nav__dropdown">
                  <button type="button" onClick={() => { closeMenus(); navigate("/profile"); }}>
                    <User size={17} /> Profile
                  </button>
                  {isCustomer && (
                    <button type="button" onClick={() => { closeMenus(); navigate("/my-orders"); }}>
                      <Package size={17} /> My orders
                    </button>
                  )}
                  {isSeller && (
                    <button type="button" onClick={() => { closeMenus(); navigate("/seller-dashboard"); }}>
                      <LayoutDashboard size={17} /> Seller dashboard
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button" onClick={() => { closeMenus(); navigate("/admin-dashboard"); }}>
                      <LayoutDashboard size={17} /> Admin dashboard
                    </button>
                  )}
                  <button type="button" onClick={() => { closeMenus(); navigate("/support"); }}>
                    <LifeBuoy size={17} /> Support
                  </button>
                  <span />
                  <button className="is-danger" type="button" onClick={logout}>
                    <LogOut size={17} /> Sign out
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            className="bazario-nav__menu-button"
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="bazario-nav__mobile-panel">
          <nav aria-label="Mobile navigation">
            {navItems.map((item) => (
              <NavLink
                className={({ isActive }) => (isActive ? "is-active" : "")}
                end={item.to === "/"}
                key={item.to}
                to={item.to}
                onClick={closeMenus}
              >
                {item.label}
              </NavLink>
            ))}
            {(!loggedUser || isCustomer) && <NavLink to="/cart" onClick={closeMenus}>Cart</NavLink>}
            {loggedUser && <NavLink to="/notifications" onClick={closeMenus}>Notifications {unreadCount ? `(${unreadCount})` : ""}</NavLink>}
            {loggedUser && <NavLink to="/profile" onClick={closeMenus}>Profile</NavLink>}
            {isCustomer && <NavLink to="/my-orders" onClick={closeMenus}>My orders</NavLink>}
            {isSeller && <NavLink to="/seller-dashboard" onClick={closeMenus}>Seller dashboard</NavLink>}
            {isSeller && <NavLink to="/seller-orders" onClick={closeMenus}>Seller orders</NavLink>}
            {isAdmin && <NavLink to="/admin-dashboard" onClick={closeMenus}>Admin dashboard</NavLink>}
            {loggedUser && <NavLink to="/support" onClick={closeMenus}>Support</NavLink>}
          </nav>
          {loggedUser && (
            <button className="bazario-nav__mobile-signout" type="button" onClick={logout}>
              <LogOut size={17} /> Sign out
            </button>
          )}
          {!loggedUser && (
            <div className="bazario-nav__mobile-auth">
              <button type="button" onClick={() => { closeMenus(); navigate("/login"); }}>Sign in</button>
              <button type="button" onClick={() => { closeMenus(); navigate("/register"); }}>Join Bazario</button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

export default Navbar;
