import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  Camera,
  Download,
  Edit3,
  Eye,
  ImageIcon,
  LogOut,
  PackageCheck,
  Plus,
  RefreshCw,
  Shirt,
  Sparkles,
  Store,
  TabletSmartphone,
  Trash2,
  TrendingUp,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, ordersApi, productsApi, reviewsApi } from "../../services/api";
import { clearSession, getStoredUser, updateStoredUser } from "../../services/auth";
import { getCategoryLabel, PRODUCT_CATEGORIES } from "../../services/categories";
import "./SellerDashboard.css";

const detailFields = {
  clothes: [
    { name: "fabric", label: "Fabric", placeholder: "Cotton, denim, linen..." },
    { name: "fit", label: "Fit", placeholder: "Slim, relaxed, regular..." },
    { name: "sizeRange", label: "Size range", placeholder: "S, M, L, XL" },
    { name: "colors", label: "Colours", placeholder: "White, Navy, Black" },
    { name: "care", label: "Care", placeholder: "Machine wash cold" },
  ],
  electronics: [
    { name: "brand", label: "Brand", placeholder: "Samsung, Apple, Sony..." },
    { name: "model", label: "Model", placeholder: "Model name or number" },
    { name: "colors", label: "Colours", placeholder: "Black, Silver, Blue" },
    { name: "configurations", label: "RAM / storage", placeholder: "8GB + 128GB, 12GB + 256GB" },
    { name: "warranty", label: "Warranty", placeholder: "1 year warranty" },
    { name: "power", label: "Power / battery", placeholder: "5000mAh, 65W..." },
  ],
  cosmetics: [
    { name: "skinType", label: "Skin type", placeholder: "Oily, dry, sensitive..." },
    { name: "shades", label: "Shades / tones", placeholder: "Warm beige, Rose, Nude" },
    { name: "volumes", label: "Volumes", placeholder: "15ml, 30ml, 50ml" },
    { name: "ingredients", label: "Key ingredients", placeholder: "Vitamin C, aloe..." },
    { name: "expiry", label: "Expiry", placeholder: "12 months after opening" },
  ],
  medicines: [
    { name: "dosage", label: "Dosage", placeholder: "500mg, 10 tablets..." },
    { name: "packSizes", label: "Pack sizes", placeholder: "10 tablets, 20 tablets" },
    { name: "prescriptionRequired", label: "Prescription required", options: ["No", "Yes"] },
    { name: "usage", label: "Usage", placeholder: "As directed by physician" },
    { name: "manufacturer", label: "Manufacturer", placeholder: "Company name" },
    { name: "expiry", label: "Expiry date", placeholder: "MM/YYYY" },
  ],
};

const categoryMeta = {
  clothes: { icon: Shirt, note: "Add fabric, fit, size range, and care details.", sample: "Minimal cotton shirt" },
  electronics: { icon: TabletSmartphone, note: "Add brand, model, warranty, and power specs.", sample: "Noise cancelling earbuds" },
  cosmetics: { icon: Sparkles, note: "Add shade, skin type, ingredients, and expiry.", sample: "Vitamin C face serum" },
  medicines: { icon: PackageCheck, note: "Add dosage, usage, manufacturer, and expiry.", sample: "Daily wellness tablets" },
};

const variantConfig = {
  clothes: [
    { key: "size", detail: "sizeRange", label: "Size" },
    { key: "colour", detail: "colors", label: "Colour" },
  ],
  electronics: [
    { key: "colour", detail: "colors", label: "Colour" },
    { key: "configuration", detail: "configurations", label: "RAM / storage" },
  ],
  cosmetics: [
    { key: "shade", detail: "shades", label: "Shade" },
    { key: "volume", detail: "volumes", label: "Volume" },
  ],
  medicines: [
    { key: "packSize", detail: "packSizes", label: "Pack size" },
  ],
};

const initialProduct = {
  name: "",
  category: "clothes",
  price: "",
  stock: "",
  description: "",
  image: "",
  images: [],
  details: {},
  variants: [],
};

const fallbackImage =
  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80";

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function getFilledDetails(details = {}) {
  return Object.entries(details).filter(([, value]) => String(value || "").trim());
}

function parseOptions(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function getVariantOptions(variant) {
  return variant.options || {
    size: variant.size || "",
    colour: variant.color || "",
  };
}

function buildProductVariants(category, details, existingVariants = []) {
  const dimensions = variantConfig[category] || [];
  const previousStock = new Map(
    existingVariants.map((variant) => [
      JSON.stringify(getVariantOptions(variant)),
      variant.stock,
    ])
  );
  if (dimensions.length === 0) return [];

  return dimensions.reduce(
    (combinations, dimension) =>
      combinations.flatMap((combination) =>
        parseOptions(details[dimension.detail]).map((value) => ({
          ...combination,
          [dimension.key]: value,
        }))
      ),
    [{}]
  ).map((options) => ({
    options,
    stock: previousStock.get(JSON.stringify(options)) ?? "",
  }));
}

function formatDetailKey(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function getProductImage(item) {
  return item.image || item.images?.[0] || fallbackImage;
}

function getApprovalStatus(item) {
  return item.approval_status || "approved";
}

function SellerDashboard() {
  const navigate = useNavigate();
  const seller = getStoredUser();
  const [sellerProfile, setSellerProfile] = useState(seller);
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [product, setProduct] = useState(initialProduct);
  const [selectedInventoryCategory, setSelectedInventoryCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);
  const [status, setStatus] = useState(null);
  const storageInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const activeDetailFields = detailFields[product.category] || [];
  const ActiveIcon = categoryMeta[product.category]?.icon || Store;
  const productImages = product.images || [];
  const mainPreviewImage = product.image || productImages[0] || "";
  const onboardingComplete = Boolean(sellerProfile?.seller_onboarding_completed);
  const onboardingCompletion = Number(sellerProfile?.seller_onboarding_completion || 0);
  const onboardingMissing = sellerProfile?.seller_onboarding_missing || [];

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResponse, productResponse, reviewResponse, earningsResponse] = await Promise.all([
        authApi.getProfile(),
        productsApi.getMine(),
        reviewsApi.getAll(),
        ordersApi.getSellerEarnings(),
      ]);
      setSellerProfile(profileResponse.data.user);
      updateStoredUser(profileResponse.data.user);
      setProducts(productResponse.data.products || []);
      setReviews(
        (reviewResponse.data.reviews || []).filter(
          (item) => item.seller === seller?.username
        )
      );
      setEarnings(earningsResponse.data);
      setStatus(null);
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not load your products." });
    } finally {
      setLoading(false);
    }
  }, [seller?.username]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const totalInventory = useMemo(
    () => products.reduce((sum, item) => sum + Number(item.stock || 0), 0),
    [products]
  );

  const inventoryValue = useMemo(
    () => products.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.stock || 0), 0),
    [products]
  );

  const lowStockCount = useMemo(
    () => products.filter((item) => Number(item.stock || 0) > 0 && Number(item.stock || 0) <= 5).length,
    [products]
  );

  const approvalCounts = useMemo(() => {
    return products.reduce(
      (counts, item) => ({
        ...counts,
        [getApprovalStatus(item)]: (counts[getApprovalStatus(item)] || 0) + 1,
      }),
      { approved: 0, pending: 0, rejected: 0 }
    );
  }, [products]);

  const categoryCounts = useMemo(() => {
    return PRODUCT_CATEGORIES.reduce((counts, category) => {
      counts[category.value] = products.filter((item) => item.category === category.value).length;
      return counts;
    }, {});
  }, [products]);

  const draftCompletion = useMemo(() => {
    const checks = [
      product.name.trim(),
      product.price,
      variantConfig[product.category] ? product.variants.length > 0 : product.stock !== "",
      product.description.trim(),
      productImages.length > 0,
      getFilledDetails(product.details).length >= 2,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [product, productImages.length]);

  const filteredProducts = useMemo(() => {
    if (selectedInventoryCategory === "all") return products;
    return products.filter((item) => item.category === selectedInventoryCategory);
  }, [products, selectedInventoryCategory]);

  const recentReviews = useMemo(
    () =>
      [...reviews].sort(
        (first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0)
      ).slice(0, 6),
    [reviews]
  );

  const exportEarnings = () => {
    if (!earnings) return;
    const rows = [
      ["Metric", "Value"],
      ["Delivered earnings", earnings.summary.delivered_earnings],
      ["Pending earnings", earnings.summary.pending_earnings],
      ["Deductions", earnings.summary.deductions],
      ["Eligible payout", earnings.summary.eligible_payout],
      [],
      ["Order", "Date", "Status", "Payment", "Amount", "Deduction", "Net", "Payout status"],
      ...earnings.transactions.map((item) => [
        item.reference,
        formatDate(item.created_at),
        item.status,
        item.payment_method,
        item.amount,
        item.deduction,
        item.net_amount,
        item.payout_status,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bazario-seller-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const setProductField = (field, value) => {
    setProduct((current) => ({ ...current, [field]: value }));
    setStatus(null);
  };

  const setProductCategory = (category) => {
    setProduct((current) => ({
      ...current,
      category,
      details: category === "medicines" ? { prescriptionRequired: "No" } : {},
      variants: [],
    }));
    setStatus(null);
  };

  const setProductDetail = (field, value) => {
    setProduct((current) => {
      const details = {
        ...current.details,
        [field]: value,
      };
      return {
        ...current,
        details,
        variants:
          variantConfig[current.category]?.some((dimension) => dimension.detail === field)
            ? buildProductVariants(current.category, details, current.variants)
            : current.variants,
      };
    });
    setStatus(null);
  };

  const setVariantStock = (options, value) => {
    setProduct((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        JSON.stringify(getVariantOptions(variant)) === JSON.stringify(options)
          ? { ...variant, stock: value }
          : variant
      ),
    }));
    setStatus(null);
  };

  const uploadProductImages = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) return;

    if (!onboardingComplete) {
      setStatus({ type: "error", text: "Complete seller setup before uploading product images." });
      navigate("/seller-onboarding");
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length !== files.length) {
      setStatus({ type: "error", text: "Only image files can be uploaded." });
      return;
    }

    setUploadingImages(true);
    setStatus(null);

    try {
      const uploadedImages = await Promise.all(
        imageFiles.map((file) =>
          productsApi.uploadImage(file).then((response) => response.data.image_url)
        )
      );

      setProduct((current) => {
        const nextImages = [...(current.images || []), ...uploadedImages];
        return {
          ...current,
          images: nextImages,
          image: current.image || nextImages[0] || "",
        };
      });
      setStatus({
        type: "success",
        text: `${uploadedImages.length} image${uploadedImages.length === 1 ? "" : "s"} uploaded.`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        text: error.response?.data?.detail || "Could not upload images. Check Cloudinary configuration.",
      });
    } finally {
      setUploadingImages(false);
    }
  };

  const setMainImage = (image) => {
    setProduct((current) => ({ ...current, image }));
    setStatus(null);
  };

  const removeProductImage = (image) => {
    setProduct((current) => {
      const nextImages = (current.images || []).filter((item) => item !== image);
      return {
        ...current,
        images: nextImages,
        image: current.image === image ? nextImages[0] || "" : current.image,
      };
    });
    setStatus(null);
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    if (!onboardingComplete) {
      setStatus({ type: "error", text: "Complete seller onboarding before adding products." });
      navigate("/seller-onboarding");
      return;
    }
    const price = Number(product.price);
    const hasVariants = Boolean(variantConfig[product.category]) && product.variants.length > 0;
    const variants = product.variants.map((variant) => ({
      options: getVariantOptions(variant),
      stock: Number(variant.stock),
    }));
    const stock = hasVariants
      ? variants.reduce((sum, variant) => sum + variant.stock, 0)
      : Number(product.stock);
    const details = Object.fromEntries(
      Object.entries(product.details).map(([key, value]) => [key, String(value || "").trim()])
    );

    if (!product.name.trim() || !product.category.trim() || !product.description.trim()) {
      setStatus({ type: "error", text: "Name, category, and description are required." });
      return;
    }

    if (getFilledDetails(details).length < 2) {
      setStatus({ type: "error", text: `Add at least two ${getCategoryLabel(product.category).toLowerCase()} detail fields.` });
      return;
    }

    if (productImages.length === 0) {
      setStatus({ type: "error", text: "Upload at least one product image." });
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setStatus({ type: "error", text: "Enter a valid price greater than zero." });
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      setStatus({ type: "error", text: "Enter a valid whole-number stock quantity." });
      return;
    }

    if (
      variantConfig[product.category]
      && (
        variantConfig[product.category].some(
          (dimension) => parseOptions(details[dimension.detail]).length === 0
        )
        || variants.length === 0
        || variants.some((variant) => !Number.isInteger(variant.stock) || variant.stock < 0)
      )
    ) {
      setStatus({
        type: "error",
        text: "Add every product option and whole-number stock for each combination.",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: product.name.trim(),
        category: product.category.trim().toLowerCase(),
        description: product.description.trim(),
        image: mainPreviewImage,
        images: productImages,
        price,
        stock,
        details,
        variants: hasVariants ? variants : [],
      };
      const response = editingId
        ? await productsApi.update(editingId, payload)
        : await productsApi.add(payload);
      setProducts((current) =>
        editingId
          ? current.map((item) => item._id === editingId ? response.data.product : item)
          : [...current, response.data.product]
      );
      setProduct({ ...initialProduct, category: product.category });
      setEditingId("");
      setStatus({
        type: "success",
        text: editingId ? "Product updated and published." : "Product added and published.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        text: error.response?.data?.detail || `Could not ${editingId ? "update" : "add"} product.`,
      });
    } finally {
      setSaving(false);
    }
  };

  const updateStock = async (productId, stock) => {
    const nextStock = Number(stock);
    if (!Number.isInteger(nextStock) || nextStock < 0) {
      setStatus({ type: "error", text: "Stock must be a whole number of zero or more." });
      return;
    }

    try {
      await productsApi.updateStock(productId, nextStock);
      setProducts((current) =>
        current.map((item) => item._id === productId ? { ...item, stock: nextStock } : item)
      );
      setStatus({ type: "success", text: "Stock updated." });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not update stock." });
    }
  };

  const updateVariantStock = async (productId, options, stock) => {
    const nextStock = Number(stock);
    if (!Number.isInteger(nextStock) || nextStock < 0) {
      setStatus({ type: "error", text: "Variant stock must be a whole number of zero or more." });
      return;
    }

    try {
      const response = await productsApi.updateVariantStock(productId, options, nextStock);
      setProducts((current) =>
        current.map((item) =>
          item._id === productId
            ? {
                ...item,
                stock: response.data.total_stock,
                variants: item.variants.map((variant) =>
                  JSON.stringify(getVariantOptions(variant)) === JSON.stringify(options)
                    ? { ...variant, stock: nextStock }
                    : variant
                ),
              }
            : item
        )
      );
      setStatus({
        type: "success",
        text: `${Object.values(options).join(" / ")} stock updated.`,
      });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not update variant stock." });
    }
  };

  const removeProduct = async (item) => {
    const confirmed = window.confirm(
      `Remove "${item.name}" from the marketplace? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await productsApi.remove(item._id);
      setProducts((current) => current.filter((productItem) => productItem._id !== item._id));
      setStatus({ type: "success", text: "Product removed from the marketplace." });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not remove product." });
    }
  };

  const replyToReview = async (item) => {
    const message = window.prompt(`Reply to ${item.buyer_name || item.username}'s review`);
    if (message === null) return;
    if (message.trim().length < 2) {
      setStatus({ type: "error", text: "Reply must contain at least 2 characters." });
      return;
    }
    try {
      const response = await reviewsApi.sellerReply(item._id, message.trim());
      setReviews((current) =>
        current.map((reviewItem) =>
          reviewItem._id === item._id
            ? { ...reviewItem, seller_reply: response.data.seller_reply }
            : reviewItem
        )
      );
      setStatus({ type: "success", text: response.data.message });
    } catch (error) {
      setStatus({ type: "error", text: error.response?.data?.detail || "Could not reply to review." });
    }
  };

  const editProduct = (item) => {
    setEditingId(item._id);
    setProduct({
      name: item.name || "",
      category: item.category || "clothes",
      price: String(item.price ?? ""),
      stock: String(item.stock ?? ""),
      description: item.description || "",
      image: item.image || item.images?.[0] || "",
      images: item.images?.length ? [...item.images] : item.image ? [item.image] : [],
      details: { ...(item.details || {}) },
      variants: (item.variants || []).map((variant) => ({
        options: { ...getVariantOptions(variant) },
        stock: String(variant.stock ?? 0),
      })),
    });
    setStatus({ type: "success", text: `Editing ${item.name}. Save when your changes are ready.` });
    window.requestAnimationFrame(() => {
      document.getElementById("seller-create")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const logout = () => {
    clearSession();
    navigate("/login");
  };

  const resetProduct = () => {
    setProduct({ ...initialProduct, category: product.category });
    setEditingId("");
    setStatus(null);
  };

  return (
    <main className="seller-page">
      <nav className="seller-topbar" aria-label="Seller workspace navigation">
        <button type="button" onClick={() => navigate("/")}>
          <span>B</span>
          Bazario studio
        </button>
        <div>
          <a href="#seller-create">Create</a>
          <a href="#seller-inventory">Inventory</a>
          <a href="#seller-reviews">Reviews</a>
          <a href="#seller-earnings">Earnings</a>
          <button type="button" onClick={() => navigate("/seller-onboarding")}>Setup</button>
          <button type="button" onClick={() => navigate("/seller-orders")}>Orders</button>
          <button type="button" onClick={() => navigate("/notifications")}><Bell size={15} /> Alerts</button>
          <button type="button" onClick={loadDashboard}>Refresh</button>
        </div>
      </nav>

      <header className="seller-hero">
        <div>
          <p>Seller product studio</p>
          <h1>Welcome, {seller?.firstName || "Seller"}.</h1>
          <span>Add focused products, fill category-specific details, and manage only your Bazario inventory.</span>
          <div className="seller-hero__badges" aria-label="Seller workspace highlights">
            <span><Store size={15} /> Seller-only access</span>
            <span><Sparkles size={15} /> Four focused categories</span>
            <span><Boxes size={15} /> Live inventory tools</span>
          </div>
        </div>
        <div className="seller-hero__actions">
          <button type="button" onClick={() => navigate("/")}>
            Storefront <ArrowRight size={16} />
          </button>
          <button type="button" onClick={logout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
        <aside className="seller-hero__visual" aria-label="Seller dashboard snapshot">
          <div>
            <small>Studio health</small>
            <strong>{draftCompletion}%</strong>
            <span>current draft readiness</span>
          </div>
        <div>
          <small>Inventory value</small>
          <strong>{formatCurrency(inventoryValue)}</strong>
          <span>{approvalCounts.approved} live listing{approvalCounts.approved === 1 ? "" : "s"}</span>
        </div>
          <div className="seller-hero__orbit" aria-label="Seller category worlds">
            {PRODUCT_CATEGORIES.map((category) => {
              const Icon = categoryMeta[category.value]?.icon || Store;
              return (
                <article key={category.value}>
                  <span>
                    <Icon size={20} />
                  </span>
                  <strong>{category.label}</strong>
                  <small>{categoryCounts[category.value] || 0} listed</small>
                </article>
              );
            })}
          </div>
        </aside>
      </header>

      {status && <div className={`seller-status seller-status--${status.type}`}>{status.text}</div>}

      {!onboardingComplete && (
        <section className="seller-section seller-onboarding-card" aria-label="Seller onboarding required">
          <div>
            <p>Seller setup required</p>
            <h2>Complete your store details before adding products.</h2>
            <span>{onboardingCompletion}% complete</span>
            {onboardingMissing.length > 0 && (
              <small>Missing: {onboardingMissing.join(", ").replace(/_/g, " ")}</small>
            )}
          </div>
          <button type="button" onClick={() => navigate("/seller-onboarding")}>
            Complete setup <ArrowRight size={17} />
          </button>
        </section>
      )}

      <section className="seller-stats seller-stats--products" aria-label="Seller product overview">
        <article><Store size={18} /><strong>{products.length}</strong><span>Your products</span></article>
        <article><PackageCheck size={18} /><strong>{totalInventory}</strong><span>Units in stock</span></article>
        <article><TrendingUp size={18} /><strong>{formatCurrency(earnings?.summary?.delivered_earnings || 0)}</strong><span>Delivered earnings</span></article>
        <article><AlertTriangle size={18} /><strong>{lowStockCount}</strong><span>Low stock</span></article>
        <article><Bell size={18} /><strong>{approvalCounts.approved}</strong><span>Published</span></article>
      </section>

      <section className="seller-section seller-section--earnings" id="seller-earnings">
        <div className="seller-section__header seller-section__header--split">
          <div>
            <p>Seller earnings</p>
            <h2>Revenue, payouts, and product sales</h2>
          </div>
          <button className="seller-form__secondary" type="button" onClick={exportEarnings} disabled={!earnings}>
            <Download size={16} /> Export CSV
          </button>
        </div>
        {earnings ? (
          <>
            <div className="seller-earnings-grid">
              <article><WalletCards size={19} /><span>Eligible payout</span><strong>{formatCurrency(earnings.summary.eligible_payout)}</strong><small>Delivered after approved returns</small></article>
              <article><TrendingUp size={19} /><span>Pending earnings</span><strong>{formatCurrency(earnings.summary.pending_earnings)}</strong><small>Processing, packed, shipped, or out for delivery</small></article>
              <article><AlertTriangle size={19} /><span>Deductions</span><strong>{formatCurrency(earnings.summary.deductions)}</strong><small>Cancelled or approved return amounts</small></article>
              <article><PackageCheck size={19} /><span>Delivered orders</span><strong>{earnings.summary.delivered_orders}</strong><small>{earnings.summary.orders_count} total seller orders</small></article>
            </div>

            <div className="seller-finance-panels">
              <section>
                <h3>Product-wise sales</h3>
                <div className="seller-sales-table">
                  {(earnings.product_sales || []).slice(0, 6).map((item) => (
                    <article key={item.product_id || item.name}>
                      <span>{item.name}</span>
                      <strong>{formatCurrency(item.revenue)}</strong>
                      <small>{item.units} sold | {item.delivered_units} delivered | {item.pending_units} pending</small>
                    </article>
                  ))}
                  {earnings.product_sales.length === 0 && <div className="seller-empty">No product sales yet.</div>}
                </div>
              </section>
              <section>
                <h3>Payout status</h3>
                <div className="seller-payout-list">
                  {earnings.payouts.map((item) => (
                    <article className={`seller-payout seller-payout--${item.status}`} key={item.label}>
                      <span>{item.status}</span>
                      <strong>{formatCurrency(item.amount)}</strong>
                      <p>{item.label}</p>
                      <small>{item.note}</small>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <section className="seller-transactions">
              <h3>Recent earning activity</h3>
              {(earnings.transactions || []).slice(0, 8).map((item) => (
                <article key={item.order_id}>
                  <div>
                    <strong>Order #{item.reference}</strong>
                    <span>{formatDate(item.created_at)} | {item.status} | {item.payment_method?.toUpperCase()}</span>
                  </div>
                  <div>
                    <b>{formatCurrency(item.net_amount)}</b>
                    <small>{item.payout_status}</small>
                  </div>
                </article>
              ))}
              {earnings.transactions.length === 0 && <div className="seller-empty">No earning activity yet.</div>}
            </section>
          </>
        ) : (
          <div className="seller-empty">Loading earnings...</div>
        )}
      </section>

      <section className="seller-section seller-section--studio" id="seller-create">
        <div className="seller-section__header seller-section__header--split">
          <div>
            <p>{editingId ? "Edit product" : "Add product"}</p>
            <h2>{editingId ? "Update your listing" : "Create a detailed listing"}</h2>
          </div>
          <div className="seller-category-tabs" aria-label="Choose product category">
            {PRODUCT_CATEGORIES.map((category) => {
              const Icon = categoryMeta[category.value]?.icon || Store;
              return (
                <button
                  className={product.category === category.value ? "is-active" : ""}
                  key={category.value}
                  type="button"
                  onClick={() => setProductCategory(category.value)}
                >
                  <Icon size={16} />
                  <span>{category.label}</span>
                  <small>{categoryCounts[category.value] || 0}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="seller-category-note" data-completion={draftCompletion}>
          <div>
            <ActiveIcon size={18} />
            <span>{categoryMeta[product.category]?.note}</span>
          </div>
          <strong>{draftCompletion}% ready</strong>
        </div>

        <div className="seller-studio-grid">
          <form className="seller-form" onSubmit={saveProduct}>
            <label>
              <span>Product name</span>
              <input
                placeholder={categoryMeta[product.category]?.sample}
                value={product.name}
                onChange={(event) => setProductField("name", event.target.value)}
              />
            </label>
            <label>
              <span>Category</span>
              <select
                value={product.category}
                onChange={(event) => setProductCategory(event.target.value)}
                required
              >
                {PRODUCT_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Price</span>
              <input
                min="0.01"
                placeholder="1999"
                step="0.01"
                type="number"
                value={product.price}
                onChange={(event) => setProductField("price", event.target.value)}
              />
            </label>
            <label>
              <span>{variantConfig[product.category] ? "Total stock" : "Stock"}</span>
              <input
                min="0"
                placeholder={variantConfig[product.category] ? "Calculated from variants" : "20"}
                step="1"
                type="number"
                disabled={Boolean(variantConfig[product.category])}
                value={
                  variantConfig[product.category]
                    ? product.variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0)
                    : product.stock
                }
                onChange={(event) => setProductField("stock", event.target.value)}
              />
            </label>
            <section className="seller-media-uploader">
              <div>
                <span>Product images</span>
                <p>Browse from storage or capture with camera. Multiple images are supported.</p>
              </div>
              <input
                ref={storageInputRef}
                accept="image/*"
                multiple
                type="file"
                onChange={uploadProductImages}
              />
              <input
                ref={cameraInputRef}
                accept="image/*"
                capture="environment"
                multiple
                type="file"
                onChange={uploadProductImages}
              />
              <div className="seller-media-uploader__actions">
                <button type="button" onClick={() => storageInputRef.current?.click()} disabled={uploadingImages || !onboardingComplete}>
                  <Upload size={17} /> Browse files
                </button>
                <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploadingImages || !onboardingComplete}>
                  <Camera size={17} /> Camera
                </button>
              </div>
              {uploadingImages && <small>Uploading images...</small>}
              {productImages.length > 0 && (
                <div className="seller-uploaded-images" aria-label="Uploaded product images">
                  {productImages.map((image) => (
                    <article className={mainPreviewImage === image ? "is-main" : ""} key={image}>
                      <button type="button" onClick={() => setMainImage(image)}>
                        <img src={image} alt="Uploaded product" />
                        <span>{mainPreviewImage === image ? "Main image" : "Set main"}</span>
                      </button>
                      <button type="button" aria-label="Remove image" onClick={() => removeProductImage(image)}>
                        <X size={14} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <label className="seller-form__wide">
              <span>Description</span>
              <textarea
                placeholder="Describe materials, usage, benefits, warranty, or safety information."
                value={product.description}
                onChange={(event) => setProductField("description", event.target.value)}
              />
            </label>

            <fieldset className="seller-detail-fields">
              <legend>{getCategoryLabel(product.category)} details</legend>
              {activeDetailFields.map((field) => (
                <label key={field.name}>
                  <span>{field.label}</span>
                  {field.options ? (
                    <select
                      value={product.details[field.name] || field.options[0]}
                      onChange={(event) => setProductDetail(field.name, event.target.value)}
                    >
                      {field.options.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      placeholder={field.placeholder}
                      value={product.details[field.name] || ""}
                      onChange={(event) => setProductDetail(field.name, event.target.value)}
                    />
                  )}
                </label>
              ))}
            </fieldset>

            {variantConfig[product.category] && (
              <fieldset className="seller-variant-fields seller-form__wide">
                <legend>{getCategoryLabel(product.category)} option stock</legend>
                <p>Stock is tracked separately for every combination.</p>
                {product.variants.length > 0 ? (
                  <div className="seller-variant-grid">
                    {product.variants.map((variant) => (
                      <label key={JSON.stringify(getVariantOptions(variant))}>
                        <span>{Object.values(getVariantOptions(variant)).join(" / ")}</span>
                        <input
                          min="0"
                          placeholder="0"
                          step="1"
                          type="number"
                          value={variant.stock}
                          onChange={(event) =>
                            setVariantStock(getVariantOptions(variant), event.target.value)
                          }
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <small>Enter comma-separated options above to build the stock matrix.</small>
                )}
              </fieldset>
            )}

            <div className="seller-form__actions">
              <button type="button" className="seller-form__secondary" onClick={resetProduct}>
                <RefreshCw size={17} /> {editingId ? "Cancel editing" : "Reset draft"}
              </button>
              <button type="submit" disabled={saving || !onboardingComplete}>
                {editingId ? <Edit3 size={17} /> : <Plus size={17} />}
                {!onboardingComplete ? "Complete setup first" : saving ? "Saving..." : editingId ? "Save changes" : "Add product"}
              </button>
            </div>
          </form>

          <aside className="seller-preview" aria-label="Listing preview">
            <div className="seller-preview__image">
              {mainPreviewImage ? <img alt="" src={mainPreviewImage} /> : <ImageIcon size={38} />}
            </div>
            <div className="seller-preview__body">
              <span>{getCategoryLabel(product.category)}</span>
              <h3>{product.name || categoryMeta[product.category]?.sample}</h3>
              <strong>{formatCurrency(product.price)}</strong>
              <p>{product.description || "Your product description preview will appear here."}</p>
              <dl>
                {getFilledDetails(product.details).slice(0, 4).map(([key, value]) => (
                  <div key={key}>
                    <dt>{formatDetailKey(key)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </div>
      </section>

      <section className="seller-section seller-section--inventory" id="seller-inventory">
        <div className="seller-section__header seller-section__header--split">
          <div>
            <p>Inventory</p>
            <h2>Your products only</h2>
          </div>
          <div className="seller-inventory-filter">
            <button
              className={selectedInventoryCategory === "all" ? "is-active" : ""}
              type="button"
              onClick={() => setSelectedInventoryCategory("all")}
            >
              All
            </button>
            {PRODUCT_CATEGORIES.map((category) => (
              <button
                className={selectedInventoryCategory === category.value ? "is-active" : ""}
                key={category.value}
                type="button"
                onClick={() => setSelectedInventoryCategory(category.value)}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div className="seller-empty">Loading products...</div> : (
          <div className="seller-grid">
            {filteredProducts.map((item) => {
              const stock = Number(item.stock || 0);
              const stockState = stock === 0 ? "out" : stock <= 5 ? "low" : "ok";

              return (
              <article className="seller-product" key={item._id}>
                <div className="seller-product__media">
                  <img alt={item.name} src={getProductImage(item)} />
                  <span className={`seller-stock-badge seller-stock-badge--${stockState}`}>
                    {stockState === "out" ? "Out of stock" : stockState === "low" ? "Low stock" : "In stock"}
                  </span>
                  <span className={`seller-approval-badge seller-approval-badge--${getApprovalStatus(item)}`}>
                    {getApprovalStatus(item).replace("_", " ")}
                  </span>
                </div>
                <div>
                  <span>{getCategoryLabel(item.category)}</span>
                  <h3>{item.name}</h3>
                  <strong>{formatCurrency(item.price)}</strong>
                  {getApprovalStatus(item) !== "approved" && (
                    <p className="seller-approval-note">
                      {getApprovalStatus(item) === "pending"
                        ? "Waiting for admin approval before this appears in the marketplace."
                        : item.approval_note || "Rejected by admin. Edit the listing and submit again."}
                    </p>
                  )}
                  {getFilledDetails(item.details).length > 0 && (
                    <dl className="seller-product-details">
                      {getFilledDetails(item.details).slice(0, 4).map(([key, value]) => (
                        <div key={key}>
                          <dt>{formatDetailKey(key)}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {item.variants?.length > 0 ? (
                    <div className="seller-inventory-variants">
                      <span>Variant stock</span>
                      {item.variants.map((variant) => (
                        <label key={JSON.stringify(getVariantOptions(variant))}>
                          {Object.values(getVariantOptions(variant)).join(" / ")}
                          <input
                            min="0"
                            step="1"
                            type="number"
                            defaultValue={variant.stock}
                            onBlur={(event) =>
                              updateVariantStock(
                                item._id,
                                getVariantOptions(variant),
                                event.target.value
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <label className="seller-stock">
                      Stock
                      <input
                        min="0"
                        step="1"
                        type="number"
                        defaultValue={item.stock ?? 0}
                        onBlur={(event) => updateStock(item._id, event.target.value)}
                      />
                    </label>
                  )}
                  <div className="seller-product__actions">
                    <button className="seller-product__edit" type="button" onClick={() => editProduct(item)}>
                      <Edit3 size={16} /> Edit
                    </button>
                    <button
                      className="seller-product__view"
                      type="button"
                      disabled={getApprovalStatus(item) !== "approved"}
                      onClick={() => navigate(`/products/${item._id}`)}
                    >
                      <Eye size={16} /> {getApprovalStatus(item) === "approved" ? "View listing" : "Not live"}
                    </button>
                    <button className="seller-product__remove" type="button" onClick={() => removeProduct(item)}>
                      <Trash2 size={16} /> Remove
                    </button>
                  </div>
                </div>
              </article>
            );
            })}
            {filteredProducts.length === 0 && <div className="seller-empty">No products in this category yet.</div>}
          </div>
        )}
      </section>

      <section className="seller-section seller-section--reviews" id="seller-reviews">
        <div className="seller-section__header seller-section__header--split">
          <div>
            <p>Buyer trust</p>
            <h2>Verified product reviews</h2>
          </div>
          <button className="seller-form__secondary" type="button" onClick={loadDashboard}>
            <RefreshCw size={16} /> Refresh reviews
          </button>
        </div>
        <div className="seller-review-list">
          {recentReviews.map((item) => (
            <article key={item._id}>
              <header>
                <span>{item.rating}/5</span>
                <strong>{item.product_name}</strong>
                <small>{item.buyer_name || item.username}</small>
              </header>
              {item.title && <h3>{item.title}</h3>}
              <p>{item.review}</p>
              {item.seller_reply ? (
                <div>
                  <b>Your reply</b>
                  <p>{item.seller_reply.message}</p>
                </div>
              ) : (
                <button type="button" onClick={() => replyToReview(item)}>
                  Reply to review
                </button>
              )}
            </article>
          ))}
          {recentReviews.length === 0 && <div className="seller-empty">No verified reviews yet.</div>}
        </div>
      </section>
    </main>
  );
}

export default SellerDashboard;
