import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Rating } from "../components/Rating";
import { Avatar } from "../components/Avatar";
import { Skeleton, SkeletonText } from "../components/Skeleton";
import { fetchProduct } from "../api";
import type { Product } from "../types";
import {
  AlertIcon,
  CartIcon,
  CheckIcon,
  ChevronRightIcon,
  HeartIcon,
  MinusIcon,
  PlusIcon,
} from "../icons";

const REVIEWS = [
  {
    name: "Sasha Pham",
    rating: 5,
    when: "3 days ago",
    body: "Exceeded expectations. Build quality is solid and shipping was fast.",
  },
  {
    name: "Theo Marsh",
    rating: 4,
    when: "1 week ago",
    body: "Works as advertised. Took off a star because the manual is barely a manual.",
  },
  {
    name: "Petra Loft",
    rating: 5,
    when: "2 weeks ago",
    body:
      "Bought a second one for my partner. That's the highest praise I can give.",
  },
];

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [variant, setVariant] = useState("standard");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setActiveImage(0);
    fetchProduct(id)
      .then(setProduct)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (error) {
    return (
      <Layout>
        <div className="text-center py-20 px-6 text-zinc-700 dark:text-zinc-300">
          <AlertIcon
            width={28}
            height={28}
            className="text-red-600 dark:text-red-400 mb-3 inline-block"
          />
          <h1 className="m-0 mb-2 text-2xl text-zinc-900 dark:text-zinc-100 font-semibold">
            Product not found
          </h1>
          <p className="mb-4">{error}</p>
          <Link to="/products">
            <Button>Back to products</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  if (loading || !product) {
    return (
      <Layout>
        <div className="grid grid-cols-[1.1fr_1fr] gap-12 pt-6 pb-14">
          <div className="flex flex-col gap-3">
            <Skeleton width="100%" height={420} rounded="md" />
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} width={68} height={68} rounded="sm" />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3.5">
            <Skeleton height={12} width={80} />
            <Skeleton height={28} width="80%" />
            <SkeletonText lines={4} />
          </div>
        </div>
      </Layout>
    );
  }

  const wasPrice =
    product.discountPercentage > 0
      ? product.price / (1 - product.discountPercentage / 100)
      : null;

  return (
    <Layout>
      <nav
        className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 py-4 flex-wrap"
        aria-label="Breadcrumb"
      >
        <Link
          to="/"
          className="no-underline text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 capitalize"
        >
          Home
        </Link>
        <ChevronRightIcon width={12} height={12} />
        <Link
          to="/products"
          className="no-underline text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 capitalize"
        >
          Products
        </Link>
        <ChevronRightIcon width={12} height={12} />
        <Link
          to="/products"
          className="no-underline text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 capitalize"
        >
          {product.category.replace(/-/g, " ")}
        </Link>
        <ChevronRightIcon width={12} height={12} />
        <span className="text-zinc-900 dark:text-zinc-100 font-medium">
          {product.title}
        </span>
      </nav>

      <div className="grid grid-cols-[1.1fr_1fr] gap-12 pt-6 pb-14">
        <div className="flex flex-col gap-3">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 aspect-square overflow-hidden relative grid place-items-center">
            <img
              src={product.images[activeImage] ?? product.thumbnail}
              alt={product.title}
              className="w-4/5 h-4/5 object-contain"
            />
            {wasPrice && (
              <div className="absolute top-4 left-4">
                <Badge tone="danger">
                  −{Math.round(product.discountPercentage)}%
                </Badge>
              </div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {product.images.slice(0, 6).map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  aria-label={`Show image ${i + 1}`}
                  className={`w-[68px] h-[68px] bg-white dark:bg-zinc-900 rounded-md p-1 cursor-pointer overflow-hidden border ${
                    i === activeImage
                      ? "border-indigo-500 ring-2 ring-indigo-500/30"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <img
                    src={img}
                    alt={`view ${i + 1}`}
                    className="w-full h-full object-contain"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="text-xs uppercase tracking-widest text-indigo-600 dark:text-indigo-400 font-semibold">
            {product.brand || product.category}
          </div>
          <h1 className="text-3xl leading-tight m-0 tracking-tight text-zinc-900 dark:text-zinc-100 font-semibold">
            {product.title}
          </h1>
          <div className="flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400">
            <Rating value={product.rating} showValue />
            <span>·</span>
            <a
              href="#reviews"
              className="text-indigo-600 dark:text-indigo-400 no-underline"
            >
              {REVIEWS.length} reviews
            </a>
            <span>·</span>
            <span className="capitalize">
              {product.category.replace(/-/g, " ")}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-[28px] font-bold text-zinc-900 dark:text-zinc-100">
              ${product.price.toFixed(2)}
            </span>
            {wasPrice && (
              <>
                <span className="text-base line-through text-zinc-400 dark:text-zinc-500">
                  ${wasPrice.toFixed(2)}
                </span>
                <Badge tone="danger">
                  Save {Math.round(product.discountPercentage)}%
                </Badge>
              </>
            )}
          </div>
          <p className="text-zinc-700 dark:text-zinc-300 text-[15px] leading-relaxed m-0">
            {product.description}
          </p>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Variant
            </div>
            <div className="flex gap-2">
              {["standard", "pro", "limited"].map((v) => (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`px-3.5 py-1.5 rounded-full text-[13px] cursor-pointer capitalize border ${
                    v === variant
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                      : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            <div className="inline-flex items-center border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 h-11">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="w-9 h-full bg-transparent border-0 text-zinc-700 dark:text-zinc-300 cursor-pointer grid place-items-center hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <MinusIcon width={14} height={14} />
              </button>
              <span className="px-2 min-w-8 text-center font-semibold text-zinc-900 dark:text-zinc-100">
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => q + 1)}
                aria-label="Increase quantity"
                className="w-9 h-full bg-transparent border-0 text-zinc-700 dark:text-zinc-300 cursor-pointer grid place-items-center hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <PlusIcon width={14} height={14} />
              </button>
            </div>
            <Button
              size="lg"
              iconLeft={<CartIcon />}
              fullWidth
              disabled={product.stock === 0}
            >
              {product.stock === 0 ? "Out of stock" : "Add to cart"}
            </Button>
            <Button size="lg" variant="outline" iconLeft={<HeartIcon />}>
              Save
            </Button>
          </div>

          <ul className="list-none p-0 m-0 mt-2 flex flex-col gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
            <li className="inline-flex items-center gap-2">
              <CheckIcon
                width={14}
                height={14}
                className="text-green-600 dark:text-green-400"
              />{" "}
              Free returns within 30 days
            </li>
            <li className="inline-flex items-center gap-2">
              <CheckIcon
                width={14}
                height={14}
                className="text-green-600 dark:text-green-400"
              />{" "}
              Ships in 1–2 business days
            </li>
            <li className="inline-flex items-center gap-2">
              <CheckIcon
                width={14}
                height={14}
                className="text-green-600 dark:text-green-400"
              />{" "}
              2-year warranty
            </li>
          </ul>
        </div>
      </div>

      <section id="reviews" className="py-8">
        <h2 className="m-0 mb-4 text-[22px] text-zinc-900 dark:text-zinc-100 font-semibold">
          Reviews
        </h2>
        <div className="grid grid-cols-[200px_1fr] gap-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 items-center">
          <div className="flex flex-col gap-1.5 items-start">
            <span className="text-[40px] font-bold leading-none text-zinc-900 dark:text-zinc-100">
              {product.rating.toFixed(1)}
            </span>
            <Rating value={product.rating} />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {REVIEWS.length} reviews
            </span>
          </div>
          <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
            {[5, 4, 3, 2, 1].map((s) => {
              const pct =
                s === 5 ? 70 : s === 4 ? 25 : s === 3 ? 3 : s === 2 ? 1 : 1;
              return (
                <li
                  key={s}
                  className="grid grid-cols-[32px_1fr_40px] items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300"
                >
                  <span>{s}★</span>
                  <span className="block h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <span
                      className="block h-full bg-amber-500"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 text-right">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <ul className="list-none p-0 m-0 mt-4 flex flex-col gap-4">
          {REVIEWS.map((r) => (
            <li
              key={r.name}
              className="flex gap-3 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg"
            >
              <Avatar name={r.name} size="md" />
              <div className="flex-1">
                <div className="flex justify-between">
                  <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                    {r.name}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {r.when}
                  </span>
                </div>
                <Rating value={r.rating} size={12} />
                <p className="m-0 mt-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {r.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Layout>
  );
}
