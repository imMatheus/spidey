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

const FILTER_TITLE =
  "text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400";
const INPUT_BASE =
  "px-2.5 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-md text-[13px] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

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
      <div className="grid grid-cols-[240px_1fr] gap-8 py-6">
        <aside className="sticky top-20 self-start flex flex-col gap-6">
          <div className="relative flex items-center">
            <SearchIcon className="absolute left-2.5 w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 pointer-events-none" />
            <input
              type="search"
              placeholder="Search products"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              className={`${INPUT_BASE} w-full pl-8`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className={FILTER_TITLE}>Category</div>
            <ul className="list-none p-0 m-0 flex flex-col gap-0.5">
              <li>
                <FilterItem
                  active={category === "all"}
                  onClick={() => {
                    setCategory("all");
                    setPage(0);
                  }}
                >
                  <span>All</span>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {total || "—"}
                  </span>
                </FilterItem>
              </li>
              {categories.map((c) => (
                <li key={c}>
                  <FilterItem
                    active={category === c}
                    onClick={() => {
                      setCategory(c);
                      setPage(0);
                    }}
                  >
                    <span className="capitalize">{c.replace(/-/g, " ")}</span>
                  </FilterItem>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <div className={FILTER_TITLE}>Price range</div>
            <div className="flex flex-col gap-2">
              <input
                type="range"
                min={0}
                max={2000}
                defaultValue={1000}
                className="w-full accent-indigo-500"
              />
              <div className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="number"
                  defaultValue={0}
                  className={`${INPUT_BASE} w-[70px] py-1 text-xs`}
                />
                <span>—</span>
                <input
                  type="number"
                  defaultValue={1000}
                  className={`${INPUT_BASE} w-[70px] py-1 text-xs`}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className={FILTER_TITLE}>Availability</div>
            <CheckRow defaultChecked label="In stock" />
            <CheckRow label="Free shipping" />
            <CheckRow label="On sale" />
          </div>
        </aside>

        <section>
          <div className="flex justify-between items-center pb-4">
            <div className="text-[13px] text-zinc-500 dark:text-zinc-400 flex items-center gap-3">
              {loading ? (
                "Loading…"
              ) : (
                <>
                  Showing{" "}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {sorted?.length ?? 0}
                  </strong>{" "}
                  of{" "}
                  <strong className="text-zinc-900 dark:text-zinc-100">
                    {total}
                  </strong>
                </>
              )}
              {category !== "all" && (
                <Badge tone="info">{category.replace(/-/g, " ")}</Badge>
              )}
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className={`${INPUT_BASE} py-1 text-[13px]`}
              >
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
                >
                  <Skeleton height={180} rounded="md" width="100%" />
                  <div className="p-3 pb-3.5 flex flex-col gap-2 flex-1">
                    <Skeleton height={10} width={60} />
                    <Skeleton height={14} width="80%" />
                    <SkeletonText lines={2} />
                    <div className="mt-auto flex justify-between items-center pt-1.5">
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
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
            <div className="flex items-center justify-center gap-3 py-8">
              <Button
                size="sm"
                variant="ghost"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <div className="flex gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`w-7 h-7 rounded-md text-xs cursor-pointer border ${
                      i === page
                        ? "bg-indigo-500 text-white border-indigo-500"
                        : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                {totalPages > 5 && (
                  <span className="text-zinc-400 dark:text-zinc-500 px-1">
                    …
                  </span>
                )}
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

function FilterItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full justify-between px-2.5 py-1.5 border-0 rounded-md text-[13px] cursor-pointer text-left transition-colors ${
        active
          ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-medium"
          : "bg-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

function CheckRow({
  label,
  defaultChecked,
}: {
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 cursor-pointer">
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        className="m-0 accent-indigo-500"
      />
      <span>{label}</span>
    </label>
  );
}
