import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Filter,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { productsApi, reviewsApi } from "../services/api";
import { getCategoryLabel, PRODUCT_CATEGORIES } from "../services/categories";
import "./Storefront.css";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80";
const RECENT_SEARCHES_KEY = "bazarioRecentSearches";
const PAGE_SIZE = 12;

const categoryImages = {
  clothes: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80",
  electronics: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=900&q=80",
  cosmetics: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80",
  medicines: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=900&q=80",
};

const sortOptions = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest first" },
  { value: "popular", label: "Most popular" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
];

function getProductImage(product) {
  return product.image || product.images?.[0] || FALLBACK_IMAGE;
}

function getProductTimestamp(product) {
  const explicitDate = Date.parse(product.created_at || product.createdAt || "");
  if (Number.isFinite(explicitDate)) return explicitDate;

  const objectIdTimestamp = /^[a-f\d]{24}$/i.test(product._id || "")
    ? Number.parseInt(product._id.slice(0, 8), 16) * 1000
    : 0;
  return Number.isFinite(objectIdTimestamp) ? objectIdTimestamp : 0;
}

function readRecentSearches() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((item) => typeof item === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function Products() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const query = queryParams.get("search") || "";
  const categoryQuery = queryParams.get("category") || "all";

  const [search, setSearch] = useState(query);
  const [category, setCategory] = useState(categoryQuery);
  const [minPrice, setMinPrice] = useState(queryParams.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(queryParams.get("maxPrice") || "");
  const [detailFilter, setDetailFilter] = useState(queryParams.get("detail") || "");
  const [inStockOnly, setInStockOnly] = useState(queryParams.get("stock") === "in");
  const [sortBy, setSortBy] = useState(queryParams.get("sort") || "recommended");
  const [products, setProducts] = useState([]);
  const [reviewStats, setReviewStats] = useState({});
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setSearch(query);
    setCategory(categoryQuery);
    setMinPrice(queryParams.get("minPrice") || "");
    setMaxPrice(queryParams.get("maxPrice") || "");
    setDetailFilter(queryParams.get("detail") || "");
    setInStockOnly(queryParams.get("stock") === "in");
    setSortBy(queryParams.get("sort") || "recommended");
  }, [categoryQuery, query, queryParams]);

  useEffect(() => {
    Promise.allSettled([productsApi.getAll(), reviewsApi.getAll()])
      .then(([productResult, reviewResult]) => {
        if (productResult.status === "rejected") throw productResult.reason;

        setProducts(productResult.value.data.products || []);
        setError("");

        if (reviewResult.status === "fulfilled") {
          const nextStats = {};
          (reviewResult.value.data.reviews || []).forEach((review) => {
            const current = nextStats[review.product_id] || { count: 0, total: 0 };
            current.count += 1;
            current.total += Number(review.rating || 0);
            nextStats[review.product_id] = current;
          });
          Object.values(nextStats).forEach((stats) => {
            stats.average = stats.count ? stats.total / stats.count : 0;
          });
          setReviewStats(nextStats);
        }
      })
      .catch((requestError) => {
        setError(requestError.response?.data?.detail || "Could not load products.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, category, minPrice, maxPrice, inStockOnly, sortBy]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [filtersOpen]);

  const updateFilters = (nextValues) => {
    const values = {
      search: nextValues.search ?? search,
      category: nextValues.category ?? category,
      minPrice: nextValues.minPrice ?? minPrice,
      maxPrice: nextValues.maxPrice ?? maxPrice,
      detailFilter: nextValues.detailFilter ?? detailFilter,
      inStockOnly: nextValues.inStockOnly ?? inStockOnly,
      sortBy: nextValues.sortBy ?? sortBy,
    };
    const params = new URLSearchParams();

    if (values.search.trim()) params.set("search", values.search.trim());
    if (values.category !== "all") params.set("category", values.category);
    if (values.minPrice !== "") params.set("minPrice", values.minPrice);
    if (values.maxPrice !== "") params.set("maxPrice", values.maxPrice);
    if (values.detailFilter.trim()) params.set("detail", values.detailFilter.trim());
    if (values.inStockOnly) params.set("stock", "in");
    if (values.sortBy !== "recommended") params.set("sort", values.sortBy);

    navigate(`/products${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
  };

  const rememberSearch = (value) => {
    const normalized = value.trim();
    if (!normalized) return;
    const nextRecent = [
      normalized,
      ...recentSearches.filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
    ].slice(0, 5);
    setRecentSearches(nextRecent);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextRecent));
  };

  const chooseSearch = (value) => {
    setSearch(value);
    updateFilters({ search: value });
    rememberSearch(value);
    setSuggestionsOpen(false);
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setMinPrice("");
    setMaxPrice("");
    setDetailFilter("");
    setInStockOnly(false);
    setSortBy("recommended");
    setSuggestionsOpen(false);
    navigate("/products", { replace: true });
  };

  const productSuggestions = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return [];
    const names = products
      .filter((product) =>
        product.name.toLowerCase().includes(normalized)
        || getCategoryLabel(product.category).toLowerCase().includes(normalized)
      )
      .map((product) => product.name);
    return [...new Set(names)].slice(0, 5);
  }, [products, search]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedDetail = detailFilter.trim().toLowerCase();
    const minimum = minPrice === "" ? null : Number(minPrice);
    const maximum = maxPrice === "" ? null : Number(maxPrice);

    const nextProducts = products.filter((product) => {
      const price = Number(product.price || 0);
      const matchesCategory = category === "all" || product.category === category;
      const matchesSearch =
        !normalizedSearch
        || product.name.toLowerCase().includes(normalizedSearch)
        || (product.description || "").toLowerCase().includes(normalizedSearch)
        || (product.seller || "").toLowerCase().includes(normalizedSearch)
        || getCategoryLabel(product.category).toLowerCase().includes(normalizedSearch);
      const matchesMinimum = minimum === null || !Number.isFinite(minimum) || price >= minimum;
      const matchesMaximum = maximum === null || !Number.isFinite(maximum) || price <= maximum;
      const matchesStock = !inStockOnly || Number(product.stock || 0) > 0;
      const detailValues = [
        ...Object.values(product.details || {}),
        ...(product.variants || []).flatMap((variant) => Object.values(variant.options || {})),
      ];
      const matchesDetail =
        !normalizedDetail
        || detailValues.some((value) => String(value || "").toLowerCase().includes(normalizedDetail));
      return matchesCategory && matchesSearch && matchesMinimum && matchesMaximum && matchesStock && matchesDetail;
    });

    return nextProducts.sort((first, second) => {
      if (sortBy === "price-low") return Number(first.price) - Number(second.price);
      if (sortBy === "price-high") return Number(second.price) - Number(first.price);
      if (sortBy === "newest") return getProductTimestamp(second) - getProductTimestamp(first);
      if (sortBy === "popular") {
        const firstReviews = reviewStats[first._id] || { count: 0, average: 0 };
        const secondReviews = reviewStats[second._id] || { count: 0, average: 0 };
        return (secondReviews.count * 10 + secondReviews.average)
          - (firstReviews.count * 10 + firstReviews.average);
      }
      return Number(second.stock > 0) - Number(first.stock > 0);
    });
  }, [category, detailFilter, inStockOnly, maxPrice, minPrice, products, reviewStats, search, sortBy]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMoreProducts = visibleCount < filteredProducts.length;
  const activeFilterCount = [
    category !== "all",
    minPrice !== "",
    maxPrice !== "",
    detailFilter.trim() !== "",
    inStockOnly,
  ].filter(Boolean).length;

  const categoryFilters = [{ value: "all", label: "All" }, ...PRODUCT_CATEGORIES].map((item) => ({
    ...item,
    count:
      item.value === "all"
        ? products.length
        : products.filter((product) => product.category === item.value).length,
  }));

  return (
    <div className="store-page">
      <Navbar />
      <main className="store-shell">
        <section className="store-hero store-hero--catalog">
          <div className="store-hero__content">
            <p className="store-eyebrow">Bazario marketplace</p>
            <h1>Four focused categories. No noisy aisles.</h1>
            <p>
              Browse clothes, electronics, cosmetics, and medicines from trusted sellers with
              straightforward pricing and live stock.
            </p>
            <div className="store-hero__stats" aria-label="Catalog summary">
              <span><strong>{products.length}</strong> products</span>
              <span><strong>{PRODUCT_CATEGORIES.length}</strong> categories</span>
              <span><strong>Live</strong> stock</span>
            </div>
          </div>
          <div className="store-hero__mosaic" aria-hidden="true">
            {PRODUCT_CATEGORIES.map((item) => (
              <img key={item.value} src={categoryImages[item.value]} alt="" />
            ))}
          </div>
        </section>

        <div className="store-heading store-heading--catalog">
          <div>
            <h1>Shop products</h1>
            <p>
              {filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"} available
              {category !== "all" ? ` in ${getCategoryLabel(category).toLowerCase()}` : ""}.
            </p>
          </div>
          <button className="store-mobile-filter" type="button" onClick={() => setFiltersOpen(true)}>
            <Filter size={17} />
            Filters
            {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
          </button>
        </div>

        <div className="catalog-search-wrap">
          <label className="store-field">
            Search curated catalog
            <div className="store-search">
              <Search size={18} />
              <input
                autoComplete="off"
                className="store-input"
                placeholder="Search clothes, devices, skincare, medicines..."
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  updateFilters({ search: event.target.value });
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    rememberSearch(search);
                    setSuggestionsOpen(false);
                  }
                  if (event.key === "Escape") setSuggestionsOpen(false);
                }}
              />
              {search && (
                <button
                  aria-label="Clear search"
                  className="catalog-search-clear"
                  type="button"
                  onClick={() => chooseSearch("")}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </label>

          {suggestionsOpen && (productSuggestions.length > 0 || recentSearches.length > 0) && (
            <div className="catalog-suggestions">
              {productSuggestions.length > 0 && (
                <section>
                  <span>Suggestions</span>
                  {productSuggestions.map((item) => (
                    <button key={item} type="button" onMouseDown={() => chooseSearch(item)}>
                      <Search size={15} /> {item}
                    </button>
                  ))}
                </section>
              )}
              {!search.trim() && recentSearches.length > 0 && (
                <section>
                  <div className="catalog-suggestions__heading">
                    <span>Recent searches</span>
                    <button
                      type="button"
                      onMouseDown={() => {
                        setRecentSearches([]);
                        localStorage.removeItem(RECENT_SEARCHES_KEY);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  {recentSearches.map((item) => (
                    <button key={item} type="button" onMouseDown={() => chooseSearch(item)}>
                      <Clock3 size={15} /> {item}
                    </button>
                  ))}
                </section>
              )}
            </div>
          )}
        </div>

        {filtersOpen && (
          <button
            aria-label="Close product filters"
            className="catalog-filter-backdrop"
            type="button"
            onClick={() => setFiltersOpen(false)}
          />
        )}

        <section className={`store-toolbar catalog-toolbar ${filtersOpen ? "is-open" : ""}`} aria-label="Product filters">
          <div className="catalog-toolbar__header">
            <div>
              <SlidersHorizontal size={18} />
              <strong>Refine products</strong>
            </div>
            <button aria-label="Close filters" type="button" onClick={() => setFiltersOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="store-filter-group catalog-filter--category">
            <span>Category</span>
            <div className="store-pills">
              {categoryFilters.map((item) => (
                <button
                  className={`store-pill ${category === item.value ? "is-active" : ""}`}
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setCategory(item.value);
                    updateFilters({ category: item.value });
                  }}
                >
                  {item.label}
                  <small>{item.count}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="catalog-price-filter">
            <span>Price range</span>
            <div>
              <label>
                <small>Minimum</small>
                <input
                  className="store-input"
                  inputMode="numeric"
                  min="0"
                  placeholder="Rs. 0"
                  type="number"
                  value={minPrice}
                  onChange={(event) => {
                    setMinPrice(event.target.value);
                    updateFilters({ minPrice: event.target.value });
                  }}
                />
              </label>
              <label>
                <small>Maximum</small>
                <input
                  className="store-input"
                  inputMode="numeric"
                  min="0"
                  placeholder="Any price"
                  type="number"
                  value={maxPrice}
                  onChange={(event) => {
                    setMaxPrice(event.target.value);
                    updateFilters({ maxPrice: event.target.value });
                  }}
                />
              </label>
            </div>
          </div>

          <label className="catalog-detail-filter">
            <span>Brand, size, shade, or pack</span>
            <input
              className="store-input"
              placeholder="Example: Sony, XL, Rose, 10 tablets"
              value={detailFilter}
              onChange={(event) => {
                setDetailFilter(event.target.value);
                updateFilters({ detailFilter: event.target.value });
              }}
            />
          </label>

          <label className={`catalog-stock-toggle ${inStockOnly ? "is-active" : ""}`}>
            <input
              checked={inStockOnly}
              type="checkbox"
              onChange={(event) => {
                setInStockOnly(event.target.checked);
                updateFilters({ inStockOnly: event.target.checked });
              }}
            />
            <span><Check size={15} /></span>
            In-stock products only
          </label>

          <label className="catalog-sort">
            <span>Sort by</span>
            <div>
              <select
                className="store-select"
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value);
                  updateFilters({ sortBy: event.target.value });
                }}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <ChevronDown size={16} />
            </div>
          </label>

          <div className="catalog-toolbar__actions">
            <button className="store-button store-button--ghost" type="button" onClick={clearFilters}>
              Clear all
            </button>
            <button className="store-button store-button--dark" type="button" onClick={() => setFiltersOpen(false)}>
              Show {filteredProducts.length} products
            </button>
          </div>
        </section>

        {activeFilterCount > 0 && (
          <div className="catalog-active-filters" aria-label="Active product filters">
            <span>{activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active</span>
            <button type="button" onClick={clearFilters}>Reset filters</button>
          </div>
        )}

        {loading && <div className="store-state">Loading products...</div>}
        {error && <div className="store-alert store-alert--error">{error}</div>}
        {!loading && !error && filteredProducts.length === 0 && (
          <div className="store-state catalog-empty">
            <Search size={26} />
            <strong>No products match these filters.</strong>
            <button type="button" onClick={clearFilters}>Clear filters</button>
          </div>
        )}

        {!loading && !error && visibleProducts.length > 0 && (
          <>
            <section className="store-grid product-grid">
              {visibleProducts.map((product) => {
                const reviews = reviewStats[product._id];
                return (
                  <article className="product-card" key={product._id}>
                    <img
                      className="product-card__image"
                      src={getProductImage(product)}
                      alt={product.name}
                    />
                    <div className="product-card__body">
                      <div className="product-card__meta">
                        <span className="product-card__category">{getCategoryLabel(product.category)}</span>
                        <span className={`store-stock ${product.stock > 0 ? "" : "store-stock--out"}`}>
                          {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
                        </span>
                      </div>
                      <h3>{product.name}</h3>
                      <p className="product-card__seller">By {product.seller || "Bazario seller"}</p>
                      {reviews && (
                        <div className="product-card__rating">
                          <Star size={13} fill="currentColor" />
                          <strong>{reviews.average.toFixed(1)}</strong>
                          <span>({reviews.count})</span>
                        </div>
                      )}
                      <div className="product-card__meta product-card__footer">
                        <span className="store-price">Rs. {Number(product.price).toLocaleString("en-IN")}</span>
                        <button
                          className="store-button"
                          type="button"
                          onClick={() => navigate(`/products/${product._id}`)}
                        >
                          View <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            <div className="catalog-pagination">
              <p>
                Showing {visibleProducts.length} of {filteredProducts.length} products
              </p>
              {hasMoreProducts && (
                <button
                  className="store-button store-button--dark"
                  type="button"
                  onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                >
                  Load more products
                </button>
              )}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default Products;
