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
        <div className="pdp-error">
          <AlertIcon width={28} height={28} />
          <h1>Product not found</h1>
          <p>{error}</p>
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
        <div className="pdp">
          <div className="pdp-gallery">
            <Skeleton width="100%" height={420} rounded="md" />
            <div className="pdp-thumbs">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} width={68} height={68} rounded="sm" />
              ))}
            </div>
          </div>
          <div className="pdp-info">
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
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <ChevronRightIcon width={12} height={12} />
        <Link to="/products">Products</Link>
        <ChevronRightIcon width={12} height={12} />
        <Link to="/products">{product.category.replace(/-/g, " ")}</Link>
        <ChevronRightIcon width={12} height={12} />
        <span className="crumb-current">{product.title}</span>
      </nav>

      <div className="pdp">
        <div className="pdp-gallery">
          <div className="pdp-image">
            <img
              src={product.images[activeImage] ?? product.thumbnail}
              alt={product.title}
            />
            {wasPrice && (
              <div className="pdp-image-tag">
                <Badge tone="danger">
                  −{Math.round(product.discountPercentage)}%
                </Badge>
              </div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="pdp-thumbs">
              {product.images.slice(0, 6).map((img, i) => (
                <button
                  key={i}
                  className={
                    "pdp-thumb" + (i === activeImage ? " is-active" : "")
                  }
                  onClick={() => setActiveImage(i)}
                  aria-label={`Show image ${i + 1}`}
                >
                  <img src={img} alt={`view ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdp-info">
          <div className="pdp-brand">{product.brand || product.category}</div>
          <h1 className="pdp-title">{product.title}</h1>
          <div className="pdp-meta">
            <Rating value={product.rating} showValue />
            <span className="pdp-meta-sep">·</span>
            <a href="#reviews" className="pdp-meta-link">
              {REVIEWS.length} reviews
            </a>
            <span className="pdp-meta-sep">·</span>
            <span className="pdp-meta-cat">
              {product.category.replace(/-/g, " ")}
            </span>
          </div>
          <div className="pdp-price">
            <span className="pdp-price-now">${product.price.toFixed(2)}</span>
            {wasPrice && (
              <>
                <span className="pdp-price-was">${wasPrice.toFixed(2)}</span>
                <Badge tone="danger">
                  Save {Math.round(product.discountPercentage)}%
                </Badge>
              </>
            )}
          </div>
          <p className="pdp-desc">{product.description}</p>

          <div className="pdp-variant">
            <div className="pdp-variant-label">Variant</div>
            <div className="variant-row">
              {["standard", "pro", "limited"].map((v) => (
                <button
                  key={v}
                  className={
                    "variant-chip" + (v === variant ? " is-active" : "")
                  }
                  onClick={() => setVariant(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="pdp-buy">
            <div className="qty">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                <MinusIcon width={14} height={14} />
              </button>
              <span>{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                aria-label="Increase quantity"
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

          <ul className="pdp-points">
            <li>
              <CheckIcon width={14} height={14} /> Free returns within 30 days
            </li>
            <li>
              <CheckIcon width={14} height={14} /> Ships in 1–2 business days
            </li>
            <li>
              <CheckIcon width={14} height={14} /> 2-year warranty
            </li>
          </ul>
        </div>
      </div>

      <section id="reviews" className="reviews">
        <h2>Reviews</h2>
        <div className="review-summary">
          <div className="review-big">
            <span className="review-big-num">{product.rating.toFixed(1)}</span>
            <Rating value={product.rating} />
            <span className="review-big-count">{REVIEWS.length} reviews</span>
          </div>
          <ul className="review-bars">
            {[5, 4, 3, 2, 1].map((s) => {
              const pct = s === 5 ? 70 : s === 4 ? 25 : s === 3 ? 3 : s === 2 ? 1 : 1;
              return (
                <li key={s}>
                  <span>{s}★</span>
                  <span className="review-bar">
                    <span
                      className="review-bar-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="review-bar-num">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
        <ul className="review-list">
          {REVIEWS.map((r) => (
            <li key={r.name} className="review">
              <Avatar name={r.name} size="md" />
              <div className="review-body">
                <div className="review-head">
                  <span className="review-name">{r.name}</span>
                  <span className="review-when">{r.when}</span>
                </div>
                <Rating value={r.rating} size={12} />
                <p>{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Layout>
  );
}
