import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  PackageSearch,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, supportApi } from "../../services/api";
import { clearSession, getStoredUser } from "../../services/auth";
import { getCategoryLabel } from "../../services/categories";
import "./AdminDashboard.css";

const fallbackImage =
  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=700&q=80";

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function getApprovalStatus(product) {
  return product.approval_status || "approved";
}

function AdminDashboard() {
  const navigate = useNavigate();
  const admin = getStoredUser();
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [activeView, setActiveView] = useState("overview");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [userResponse, productResponse, disputeResponse, supportResponse] = await Promise.all([
        adminApi.getUsers(),
        adminApi.getProducts(),
        adminApi.getDisputes(),
        supportApi.getAdminAll(),
      ]);
      setUsers(userResponse.data.users || []);
      setProducts(productResponse.data.products || []);
      setDisputes(disputeResponse.data.disputes || []);
      setSupportTickets(supportResponse.data.tickets || []);
      setStatus(null);
    } catch (error) {
      setStatus({
        type: "error",
        text: error.response?.data?.detail || "Could not load admin data.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = useMemo(() => {
    const customers = users.filter((user) => user.role === "customer").length;
    const sellers = users.filter((user) => user.role === "seller").length;
    const inventoryUnits = products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
    const inventoryValue = products.reduce(
      (sum, product) => sum + Number(product.price || 0) * Number(product.stock || 0),
      0
    );

    return { customers, sellers, inventoryUnits, inventoryValue };
  }, [products, users]);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.firstName, user.lastName, user.username, user.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [search, users]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      [product.name, product.category, product.seller, getApprovalStatus(product)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [products, search]);

  const visibleDisputes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return disputes;
    return disputes.filter((item) =>
      [
        item._id,
        item.username,
        item.dispute?.category,
        item.dispute?.reason,
        item.dispute?.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [disputes, search]);

  const visibleSupportTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return supportTickets;
    return supportTickets.filter((item) =>
      [item._id, item.username, item.subject, item.category, item.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [search, supportTickets]);

  const openView = (view) => {
    setActiveView(view);
    setSearch("");
  };

  const requestDelete = (type, item) => {
    setDeleteTarget({ type, item });
    setStatus(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      if (deleteTarget.type === "user") {
        await adminApi.deleteUser(deleteTarget.item._id);
        setUsers((current) => current.filter((user) => user._id !== deleteTarget.item._id));
      } else {
        await adminApi.deleteProduct(deleteTarget.item._id);
        setProducts((current) => current.filter((product) => product._id !== deleteTarget.item._id));
      }

      setStatus({
        type: "success",
        text: `${deleteTarget.type === "user" ? "User" : "Product"} removed successfully.`,
      });
      setDeleteTarget(null);
    } catch (error) {
      setStatus({
        type: "error",
        text: error.response?.data?.detail || "Could not complete this admin action.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const decideDispute = async (dispute, decision) => {
    const promptLabel = decision === "approve_refund"
      ? "Add a refund approval note"
      : decision === "reject"
        ? "Explain why this dispute is rejected"
        : "Describe how this dispute was resolved";
    const note = window.prompt(promptLabel);
    if (note === null) return;
    if (note.trim().length < 5) {
      setStatus({ type: "error", text: "Add a note of at least 5 characters." });
      return;
    }

    try {
      const response = await adminApi.decideDispute(dispute._id, decision, note.trim());
      setDisputes((current) =>
        current.map((item) =>
          item._id === dispute._id
            ? {
                ...item,
                dispute: response.data.dispute,
                payment_status: response.data.payment_status,
              }
            : item
        )
      );
      setStatus({ type: "success", text: response.data.message });
    } catch (error) {
      setStatus({
        type: "error",
        text: error.response?.data?.detail || "Could not update the dispute.",
      });
    }
  };

  const reviewProduct = async (product, decision) => {
    const note = decision === "reject"
      ? window.prompt(`Why should "${product.name}" be rejected?`)
      : window.prompt(`Approval note for "${product.name}"`, "Approved for Bazario marketplace.");
    if (note === null) return;
    if (decision === "reject" && note.trim().length < 5) {
      setStatus({ type: "error", text: "Add a rejection note of at least 5 characters." });
      return;
    }

    try {
      const response = await adminApi.reviewProduct(product._id, decision, note.trim());
      setProducts((current) =>
        current.map((item) => item._id === product._id ? response.data.product : item)
      );
      setStatus({ type: "success", text: response.data.message });
    } catch (error) {
      setStatus({
        type: "error",
        text: error.response?.data?.detail || "Could not review this product.",
      });
    }
  };

  const replyToSupport = async (ticket) => {
    const message = window.prompt(`Reply to "${ticket.subject}"`);
    if (message === null) return;
    if (message.trim().length < 2) {
      setStatus({ type: "error", text: "Support reply must contain at least 2 characters." });
      return;
    }
    try {
      const response = await supportApi.adminReply(ticket._id, message.trim());
      setSupportTickets((current) =>
        current.map((item) =>
          item._id === ticket._id
            ? {
                ...item,
                status: response.data.status,
                messages: [...item.messages, response.data.reply],
              }
            : item
        )
      );
      setStatus({ type: "success", text: response.data.message });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not reply to ticket." });
    }
  };

  const setSupportStatus = async (ticket, nextStatus) => {
    try {
      const response = await supportApi.updateStatus(ticket._id, nextStatus);
      setSupportTickets((current) =>
        current.map((item) =>
          item._id === ticket._id ? { ...item, status: response.data.status } : item
        )
      );
      setStatus({ type: "success", text: response.data.message });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not update ticket." });
    }
  };

  const logout = () => {
    clearSession();
    navigate("/login");
  };

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <button className="admin-brand" type="button" onClick={() => navigate("/")}>
          <span>B</span>
          <div>
            <strong>Bazario</strong>
            <small>Admin control</small>
          </div>
        </button>

        <div className="admin-identity">
          <div>{(admin?.firstName || admin?.username || "A").charAt(0).toUpperCase()}</div>
          <span>Signed in as</span>
          <strong>{admin?.firstName || "Administrator"}</strong>
          <small>{admin?.username}</small>
        </div>

        <nav className="admin-nav" aria-label="Admin dashboard sections">
          <button className={activeView === "overview" ? "is-active" : ""} type="button" onClick={() => openView("overview")}>
            <LayoutDashboard size={18} /> Overview
          </button>
          <button className={activeView === "users" ? "is-active" : ""} type="button" onClick={() => openView("users")}>
            <Users size={18} /> Users <span>{users.length}</span>
          </button>
          <button className={activeView === "products" ? "is-active" : ""} type="button" onClick={() => openView("products")}>
            <Boxes size={18} /> Products <span>{products.filter((item) => getApprovalStatus(item) === "pending").length || products.length}</span>
          </button>
          <button className={activeView === "disputes" ? "is-active" : ""} type="button" onClick={() => openView("disputes")}>
            <Scale size={18} /> Disputes <span>{disputes.filter((item) => ["open", "in_review"].includes(item.dispute?.status)).length}</span>
          </button>
          <button className={activeView === "support" ? "is-active" : ""} type="button" onClick={() => openView("support")}>
            <LifeBuoy size={18} /> Support <span>{supportTickets.filter((item) => ["open", "in_progress"].includes(item.status)).length}</span>
          </button>
        </nav>

        <div className="admin-sidebar__footer">
          <button type="button" onClick={() => navigate("/")}>
            <Store size={18} /> Marketplace
          </button>
          <button type="button" onClick={logout}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div>
            <p>Marketplace command center</p>
            <h1>
              {activeView === "overview"
                ? "Admin overview"
                : activeView === "users"
                  ? "User management"
                  : activeView === "products"
                    ? "Product moderation"
                    : activeView === "disputes"
                      ? "Dispute management"
                      : "Support operations"}
            </h1>
          </div>
          <button type="button" onClick={loadDashboard} disabled={loading}>
            <RefreshCw size={17} className={loading ? "is-spinning" : ""} />
            {loading ? "Refreshing..." : "Refresh data"}
          </button>
        </header>

        {status && <div className={`admin-status admin-status--${status.type}`}>{status.text}</div>}

        {activeView === "overview" && (
          <>
            <section className="admin-hero">
              <div>
                <p><ShieldCheck size={15} /> Protected administration</p>
                <h2>Keep Bazario focused, trusted, and tidy.</h2>
                <span>Review marketplace growth, manage accounts, and moderate every product from one role-protected workspace.</span>
              </div>
              <div className="admin-hero__signal">
                <span>System snapshot</span>
                <strong>{users.length + products.length}</strong>
                <small>managed records</small>
                <button type="button" onClick={() => openView("products")}>
                  Review catalog <ArrowRight size={16} />
                </button>
              </div>
            </section>

            <section className="admin-stats" aria-label="Marketplace statistics">
              <article><Users size={19} /><strong>{users.length}</strong><span>Total users</span></article>
              <article><UserRoundCog size={19} /><strong>{stats.sellers}</strong><span>Sellers</span></article>
              <article><Boxes size={19} /><strong>{products.length}</strong><span>Products</span></article>
              <article><PackageSearch size={19} /><strong>{stats.inventoryUnits}</strong><span>Stock units</span></article>
            </section>

            <section className="admin-overview-grid">
              <article className="admin-panel">
                <div className="admin-panel__header">
                  <div><p>Community</p><h2>Account composition</h2></div>
                  <button type="button" onClick={() => openView("users")}>Manage</button>
                </div>
                <div className="admin-role-chart">
                  <div style={{ "--role-share": `${users.length ? (stats.customers / users.length) * 100 : 0}%` }}>
                    <strong>{stats.customers}</strong><span>Customers</span>
                  </div>
                  <div style={{ "--role-share": `${users.length ? (stats.sellers / users.length) * 100 : 0}%` }}>
                    <strong>{stats.sellers}</strong><span>Sellers</span>
                  </div>
                  <div style={{ "--role-share": `${users.length ? ((users.length - stats.customers - stats.sellers) / users.length) * 100 : 0}%` }}>
                    <strong>{users.length - stats.customers - stats.sellers}</strong><span>Admins</span>
                  </div>
                </div>
              </article>

              <article className="admin-panel admin-panel--value">
                <p>Catalog value</p>
                <h2>{formatCurrency(stats.inventoryValue)}</h2>
                <span>Estimated from current product price multiplied by available stock.</span>
                <button type="button" onClick={() => openView("products")}>Inspect inventory</button>
              </article>

              <article className="admin-panel admin-panel--approval">
                <p>Product approvals</p>
                <h2>{products.filter((item) => getApprovalStatus(item) === "pending").length}</h2>
                <span>Seller listings waiting for admin review before they appear in the marketplace.</span>
                <button type="button" onClick={() => openView("products")}>Moderate products</button>
              </article>
            </section>
          </>
        )}

        {activeView !== "overview" && (
          <>
            <section className="admin-toolbar">
              <label>
                <Search size={18} />
                <input
                  type="search"
                  value={search}
                  placeholder={
                    activeView === "users"
                      ? "Search name, email, or role"
                      : activeView === "products"
                        ? "Search product, category, or seller"
                        : activeView === "disputes"
                          ? "Search order, customer, category, or status"
                          : "Search ticket, customer, subject, or status"
                  }
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <span>
                {activeView === "users"
                  ? visibleUsers.length
                  : activeView === "products"
                    ? visibleProducts.length
                    : activeView === "disputes"
                      ? visibleDisputes.length
                      : visibleSupportTickets.length} result
                {(activeView === "users"
                  ? visibleUsers.length
                  : activeView === "products"
                    ? visibleProducts.length
                    : activeView === "disputes"
                      ? visibleDisputes.length
                      : visibleSupportTickets.length) === 1 ? "" : "s"}
              </span>
            </section>

            {activeView === "users" ? (
              <section className="admin-table-panel">
                <div className="admin-table">
                  <div className="admin-table__head">
                    <span>User</span><span>Role</span><span>Joined</span><span>Action</span>
                  </div>
                  {visibleUsers.map((user) => (
                    <article key={user._id}>
                      <div className="admin-user-cell">
                        <span>{(user.firstName || user.username || "U").charAt(0).toUpperCase()}</span>
                        <div>
                          <strong>{[user.firstName, user.lastName].filter(Boolean).join(" ") || "Bazario user"}</strong>
                          <small>{user.username}</small>
                        </div>
                      </div>
                      <span className={`admin-role admin-role--${user.role || "customer"}`}>{user.role || "customer"}</span>
                      <span>{formatDate(user.createdAt)}</span>
                      <button
                        type="button"
                        disabled={user.username === admin?.username}
                        onClick={() => requestDelete("user", user)}
                      >
                        <Trash2 size={16} /> {user.username === admin?.username ? "Current admin" : "Remove"}
                      </button>
                    </article>
                  ))}
                  {!loading && visibleUsers.length === 0 && <div className="admin-empty">No users match this search.</div>}
                </div>
              </section>
            ) : activeView === "products" ? (
              <section className="admin-product-grid">
                {visibleProducts.map((product) => (
                  <article className={`admin-product-card admin-product-card--${getApprovalStatus(product)}`} key={product._id}>
                    <img src={product.image || product.images?.[0] || fallbackImage} alt={product.name} />
                    <div>
                      <span>{getCategoryLabel(product.category)}</span>
                      <small className={`admin-approval-badge admin-approval-badge--${getApprovalStatus(product)}`}>
                        {getApprovalStatus(product).replace("_", " ")}
                      </small>
                      <h2>{product.name}</h2>
                      <p>By {product.seller || "Unknown seller"}</p>
                      <div><strong>{formatCurrency(product.price)}</strong><small>{product.stock || 0} in stock</small></div>
                      {product.approval_note && <p className="admin-product-note">{product.approval_note}</p>}
                      <div className="admin-product-actions">
                        {getApprovalStatus(product) !== "approved" && (
                          <button className="admin-product-action--approve" type="button" onClick={() => reviewProduct(product, "approve")}>
                            Approve
                          </button>
                        )}
                        {getApprovalStatus(product) !== "rejected" && (
                          <button className="admin-product-action--reject" type="button" onClick={() => reviewProduct(product, "reject")}>
                            Reject
                          </button>
                        )}
                        <button type="button" onClick={() => requestDelete("product", product)}>
                          <Trash2 size={16} /> Remove
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!loading && visibleProducts.length === 0 && <div className="admin-empty">No products match this search.</div>}
              </section>
            ) : activeView === "disputes" ? (
              <section className="admin-dispute-list">
                {visibleDisputes.map((item) => (
                  <article className={`admin-dispute admin-dispute--${item.dispute?.status}`} key={item._id}>
                    <header>
                      <div>
                        <p>Order #{item._id.slice(-8).toUpperCase()}</p>
                        <h2>{item.dispute?.category || "Order"} dispute</h2>
                      </div>
                      <span>{item.dispute?.status || "open"}</span>
                    </header>
                    <div className="admin-dispute__meta">
                      <span>Customer <strong>{item.username}</strong></span>
                      <span>Order <strong>{item.order_status}</strong></span>
                      <span>Payment <strong>{item.payment_status}</strong></span>
                      <span>Total <strong>{formatCurrency(item.total_amount)}</strong></span>
                    </div>
                    <blockquote>{item.dispute?.reason}</blockquote>
                    {item.dispute?.admin_note && <p className="admin-dispute__note">{item.dispute.admin_note}</p>}
                    {["open", "in_review"].includes(item.dispute?.status) && (
                      <div className="admin-dispute__actions">
                        <button type="button" onClick={() => decideDispute(item, "resolve")}>
                          Resolve case
                        </button>
                        <button type="button" onClick={() => decideDispute(item, "approve_refund")}>
                          Approve refund
                        </button>
                        <button type="button" onClick={() => decideDispute(item, "reject")}>
                          Reject
                        </button>
                      </div>
                    )}
                  </article>
                ))}
                {!loading && visibleDisputes.length === 0 && (
                  <div className="admin-empty">No disputes match this search.</div>
                )}
              </section>
            ) : (
              <section className="admin-support-list">
                {visibleSupportTickets.map((ticket) => (
                  <article className={`admin-support admin-support--${ticket.status}`} key={ticket._id}>
                    <header>
                      <div>
                        <p>{ticket.category} / {ticket.username}</p>
                        <h2>{ticket.subject}</h2>
                        {ticket.order_id && <small>Order #{ticket.order_id.slice(-8).toUpperCase()}</small>}
                      </div>
                      <span>{ticket.status.replace("_", " ")}</span>
                    </header>
                    <div className="admin-support__messages">
                      {ticket.messages.map((message, index) => (
                        <div className={`is-${message.sender_role}`} key={`${message.created_at}-${index}`}>
                          <strong>{message.sender_role === "admin" ? "Support" : message.sender}</strong>
                          <p>{message.message}</p>
                          <small>{formatDate(message.created_at)}</small>
                        </div>
                      ))}
                    </div>
                    <div className="admin-support__actions">
                      <button type="button" onClick={() => replyToSupport(ticket)}>Reply</button>
                      {ticket.status !== "resolved" && (
                        <button type="button" onClick={() => setSupportStatus(ticket, "resolved")}>Resolve</button>
                      )}
                      {ticket.status !== "closed" && (
                        <button type="button" onClick={() => setSupportStatus(ticket, "closed")}>Close</button>
                      )}
                      {["resolved", "closed"].includes(ticket.status) && (
                        <button type="button" onClick={() => setSupportStatus(ticket, "open")}>Reopen</button>
                      )}
                    </div>
                  </article>
                ))}
                {!loading && visibleSupportTickets.length === 0 && (
                  <div className="admin-empty">No support tickets match this search.</div>
                )}
              </section>
            )}
          </>
        )}
      </section>

      {deleteTarget && (
        <div className="admin-dialog-backdrop" role="presentation">
          <section className="admin-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-dialog-title">
            <button className="admin-dialog__close" type="button" aria-label="Close dialog" onClick={() => setDeleteTarget(null)}>
              <X size={18} />
            </button>
            <div><AlertTriangle size={24} /></div>
            <p>Permanent admin action</p>
            <h2 id="admin-dialog-title">
              Remove {deleteTarget.type === "user" ? deleteTarget.item.username : deleteTarget.item.name}?
            </h2>
            <span>This cannot be undone. The record will be deleted from the marketplace database.</span>
            <div className="admin-dialog__actions">
              <button type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={deleting}>
                <Trash2 size={16} /> {deleting ? "Removing..." : "Confirm removal"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default AdminDashboard;
