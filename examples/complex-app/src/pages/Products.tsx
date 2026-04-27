import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { ProductCard } from "../components/ProductCard";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { Skeleton, SkeletonText } from "../components/Skeleton";
import { fetchCategories, fetchProducts } from "../api";
import type { Product } from "../types";
import { AlertIcon, PackageIcon, SearchIcon } from "../icons";

const SORTS = [
  { id: "default", label: "Featured" },
  { id: "price-asc", label: "Price: low → high" },
  { id: "price-desc", label: "Price: high → low" },
  { id: "rating", label: "Top rated" },
];

const PAGE_SIZE = 12;

export function Products() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("default");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchProducts({
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      category,
      query: query || undefined,
    })
      .then((res) => {
        setProducts(res.products);
        setTotal(res.total);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [page, category, query]);

  const sorted = products
    ? [...products].sort((a, b) => {
        if (sort === "price-asc") return a.price - b.price;
        if (sort === "price-desc") return b.price - a.price;
        if (sort === "rating") return b.rating - a.rating;
        return 0;
      })
    : null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Layout>
      <div className="catalog">
        <aside className="catalog-side">
          <div className="filter-search">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search products"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="filter-block">
            <div className="filter-title">Category</div>
            <ul className="filter-list">
              <li>
                <button
                  className={
                    "filter-item" + (category === "all" ? " is-active" : "")
                  }
                  onClick={() => {
                    setCategory("all");
                    setPage(0);
                  }}
                >
                  <span>All</span>
                  <span className="filter-count">{total || "—"}</span>
                </button>
              </li>
              {categories.map((c) => (
                <li key={c}>
                  <button
                    className={
                      "filter-item" + (category === c ? " is-active" : "")
                    }
                    onClick={() => {
                      setCategory(c);
                      setPage(0);
                    }}
                  >
                    <span className="filter-cat">{c.replace(/-/g, " ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="filter-block">
            <div className="filter-title">Price range</div>
            <div className="filter-range">
              <input type="range" min={0} max={2000} defaultValue={1000} />
              <div className="filter-range-row">
                <input type="number" defaultValue={0} />
                <span>—</span>
                <input type="number" defaultValue={1000} />
              </div>
            </div>
          </div>
          <div className="filter-block">
            <div className="filter-title">Availability</div>
            <label className="checkbox-row">
              <input type="checkbox" defaultChecked />
              <span>In stock</span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" />
              <span>Free shipping</span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" />
              <span>On sale</span>
            </label>
          </div>
        </aside>

        <section className="catalog-main">
          <div className="catalog-toolbar">
            <div className="catalog-count">
              {loading ? (
                "Loading…"
              ) : (
                <>
                  Showing <strong>{sorted?.length ?? 0}</strong> of{" "}
                  <strong>{total}</strong>
                </>
              )}
              {category !== "all" && (
                <Badge tone="info">{category.replace(/-/g, " ")}</Badge>
              )}
            </div>
            <label className="catalog-sort">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <EmptyState
              icon={<AlertIcon width={28} height={28} />}
              title="Couldn't load products"
              description={error}
              action={<Button onClick={() => setPage((p) => p)}>Retry</Button>}
            />
          ) : loading ? (
            <div className="pgrid">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div key={i} className="pcard pcard-skeleton">
                  <Skeleton height={180} rounded="md" width="100%" />
                  <div className="pcard-body">
                    <Skeleton height={10} width={60} />
                    <Skeleton height={14} width="80%" />
                    <SkeletonText lines={2} />
                    <div className="pcard-foot">
                      <Skeleton height={18} width={60} />
                      <Skeleton height={28} width={70} rounded="md" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : sorted && sorted.length === 0 ? (
            <EmptyState
              icon={<PackageIcon width={28} height={28} />}
              title="No products match"
              description="Try clearing your filters or searching for something else."
              action={
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                  }}
                >
                  Reset filters
                </Button>
              }
            />
          ) : (
            <div className="pgrid">
              {sorted!.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  isFavorite={favorites.has(p.id)}
                  onToggleFavorite={() => {
                    setFavorites((s) => {
                      const n = new Set(s);
                      if (n.has(p.id)) n.delete(p.id);
                      else n.add(p.id);
                      return n;
                    });
                  }}
                  onAddToCart={() => {}}
                />
              ))}
            </div>
          )}

          {!loading && !error && total > PAGE_SIZE && (
            <div className="pager">
              <Button
                size="sm"
                variant="ghost"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <div className="pager-pages">
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
                  <button
                    key={i}
                    className={
                      "pager-page" + (i === page ? " is-active" : "")
                    }
                    onClick={() => setPage(i)}
                  >
                    {i + 1}
                  </button>
                ))}
                {totalPages > 5 && <span className="pager-ellipsis">…</span>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages - 1}
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
              >
                Next
              </Button>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
