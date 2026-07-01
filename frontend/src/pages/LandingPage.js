import {
  ArrowRight,
  BadgeCheck,
  Box,
  ChevronLeft,
  ChevronRight,
  Compass,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { productsApi } from "../services/api";
import { getCategoryLabel } from "../services/categories";
import "./LandingPage.css";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1200&q=85";

const collections = [
  {
    name: "Clothes",
    note: "Expressive pieces for personal style",
    image: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1100&q=85",
    category: "clothes",
  },
  {
    name: "Electronics",
    note: "Useful objects without the noise",
    image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1100&q=85",
    category: "electronics",
  },
  {
    name: "Cosmetics",
    note: "Beauty and care, thoughtfully selected",
    image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1100&q=85",
    category: "cosmetics",
  },
  {
    name: "Medicines",
    note: "Everyday wellness and health essentials",
    image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1100&q=85",
    category: "medicines",
  },
];

function LandingPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCollection, setActiveCollection] = useState(0);
  const [collectionPaused, setCollectionPaused] = useState(false);

  const loadProducts = () => {
    setLoading(true);
    setError("");
    productsApi.getAll()
      .then((response) => setProducts((response.data.products || []).slice(0, 6)))
      .catch((requestError) => {
        setProducts([]);
        setError(requestError.response?.data?.detail || "The marketplace is temporarily unavailable.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => loadProducts(), []);

  useEffect(() => {
    if (collectionPaused) return undefined;

    const interval = window.setInterval(() => {
      setActiveCollection((current) => (current + 1) % collections.length);
    }, 4500);

    return () => window.clearInterval(interval);
  }, [collectionPaused]);

  const marketplaceStats = useMemo(() => {
    const sellers = new Set(products.map((product) => product.seller).filter(Boolean)).size;
    return [
      [products.length || "New", "curated products"],
      [sellers || "Independent", "active sellers"],
      [4, "focused categories"],
    ];
  }, [products]);

  const moveCollection = (direction) => {
    setActiveCollection((current) => (current + direction + collections.length) % collections.length);
  };

  const collection = collections[activeCollection];

  return (
    <div className="landing-page">
      <Navbar />

      <main>
        <section className="landing-hero">
          <div className="landing-hero__wash" />
          <div className="landing-hero__grain" />

          <div className="landing-hero__copy">
            <div className="landing-kicker">
              <Sparkles size={16} />
              A more human marketplace
            </div>
            <h1>
              Find the things
              <span>worth keeping.</span>
            </h1>
            <p>
              Bazario brings together considered products and independent sellers,
              with less clutter and more confidence.
            </p>
            <div className="landing-actions">
              <button className="landing-btn landing-btn--ink" type="button" onClick={() => navigate("/products")}>
                Enter marketplace <ArrowRight size={18} />
              </button>
              <button className="landing-btn landing-btn--paper" type="button" onClick={() => navigate("/register")}>
                Open a seller studio
              </button>
            </div>
          </div>

          <div className="landing-hero__visual">
            <div className="landing-orbit landing-orbit--one" />
            <div className="landing-orbit landing-orbit--two" />
            <img
              className="landing-hero__main-image"
              src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=90"
              alt="A curated independent retail space"
            />
            <div className="landing-float-card landing-float-card--top">
              <Compass size={19} />
              <div><strong>Curated discovery</strong><span>Chosen with intention</span></div>
            </div>
            <div className="landing-float-card landing-float-card--bottom">
              <BadgeCheck size={19} />
              <div><strong>Clear from cart to door</strong><span>Live stock and order tracking</span></div>
            </div>
          </div>

          <div className="landing-scroll-mark">Scroll to explore</div>
        </section>

        <section className="landing-manifesto landing-wrap">
          <p>THE BAZARIO POINT OF VIEW</p>
          <h2>
            Online shopping became noisy.
            <span>We are making it feel considered again.</span>
          </h2>
          <div className="landing-manifesto__grid">
            {[
              [Compass, "Discover differently", "Browse a focused marketplace shaped around products, not endless promotion."],
              [ShieldCheck, "Confidence built in", "Verified accounts, protected actions, and inventory checked twice."],
              [Store, "Independent by design", "Sellers get a practical studio to manage products, stock, and orders."],
            ].map(([Icon, title, text], index) => (
              <article key={title}>
                <span>0{index + 1}</span>
                <Icon size={25} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="landing-collection landing-wrap"
          onMouseEnter={() => setCollectionPaused(true)}
          onMouseLeave={() => setCollectionPaused(false)}
          onFocusCapture={() => setCollectionPaused(true)}
          onBlurCapture={() => setCollectionPaused(false)}
        >
          <div className="landing-section-heading">
            <div>
              <p>STORIES TO SHOP</p>
              <h2>Four focused worlds,<br />one marketplace.</h2>
            </div>
            <div className="landing-slider-controls">
              <button aria-label="Previous collection" type="button" onClick={() => moveCollection(-1)}><ChevronLeft /></button>
              <span>{activeCollection + 1} / {collections.length}</span>
              <button aria-label="Next collection" type="button" onClick={() => moveCollection(1)}><ChevronRight /></button>
            </div>
          </div>
          <article className="landing-collection__feature">
            <img key={collection.image} src={collection.image} alt={collection.name} />
            <div key={collection.name}>
              <span>Curated collection 0{activeCollection + 1}</span>
              <h3>{collection.name}</h3>
              <p>{collection.note}</p>
              <button type="button" onClick={() => navigate(`/products?category=${collection.category}`)}>
                Explore the edit <ArrowRight size={18} />
              </button>
            </div>
          </article>
          <div className="landing-collection__progress" aria-label="Collection slides">
            {collections.map((item, index) => (
              <button
                aria-label={`Show ${item.name}`}
                className={activeCollection === index ? "is-active" : ""}
                key={item.category}
                type="button"
                onClick={() => setActiveCollection(index)}
              >
                <span />
              </button>
            ))}
          </div>
        </section>

        <section className="landing-market landing-wrap">
          <div className="landing-section-heading">
            <div>
              <p>LIVE FROM THE MARKETPLACE</p>
              <h2>Freshly listed,<br />ready to discover.</h2>
            </div>
            <button className="landing-text-link" type="button" onClick={() => navigate("/products")}>
              See everything <ArrowRight size={17} />
            </button>
          </div>

          {loading && <div className="landing-state">Gathering the latest finds...</div>}
          {!loading && error && (
            <div className="landing-state landing-state--error">
              <p>{error}</p>
              <button type="button" onClick={loadProducts}><RefreshCw size={17} /> Try again</button>
            </div>
          )}
          {!loading && !error && products.length === 0 && (
            <div className="landing-state">The marketplace is waiting for its first seller collection.</div>
          )}
          {!loading && !error && products.length > 0 && (
            <div className="landing-product-grid">
              {products.map((product, index) => (
                <article
                  className={`landing-product ${index === 0 ? "landing-product--lead" : ""}`}
                  key={product._id}
                  onClick={() => navigate(`/products/${product._id}`)}
                >
                  <div className="landing-product__image">
                    <img src={product.image || FALLBACK_IMAGE} alt={product.name} />
                    <span>{product.stock > 0 ? `${product.stock} available` : "Sold out"}</span>
                  </div>
                  <div className="landing-product__copy">
                    <p>{getCategoryLabel(product.category)}</p>
                    <h3>{product.name}</h3>
                    <span className="landing-product__seller">By {product.seller || "Bazario seller"}</span>
                    <strong>₹{Number(product.price).toLocaleString("en-IN")}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="landing-seller">
          <div className="landing-wrap landing-seller__inner">
            <div className="landing-seller__copy">
              <p>FOR INDEPENDENT SELLERS</p>
              <h2>Your products deserve more than a listing.</h2>
              <span>
                Build a considered storefront, manage real inventory, and fulfill orders
                from one focused seller workspace.
              </span>
              <button className="landing-btn landing-btn--paper" type="button" onClick={() => navigate("/register")}>
                Start selling <ArrowRight size={18} />
              </button>
            </div>
            <div className="landing-seller__visual">
              <img src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=85" alt="Independent seller preparing an order" />
              <div>
                <Box size={22} />
                <strong>From first listing to fulfilled order</strong>
                <span>One workspace. No unnecessary complexity.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-stats landing-wrap">
          {marketplaceStats.map(([value, label]) => (
            <div key={label}><strong>{value}</strong><span>{label}</span></div>
          ))}
          <div><strong>Always</strong><span>clear and secure</span></div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default LandingPage;
