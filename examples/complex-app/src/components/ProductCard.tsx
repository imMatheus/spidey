import { Link } from "react-router-dom";
import type { Product } from "../types";
import { Badge } from "./Badge";
import { Rating } from "./Rating";
import { Button } from "./Button";
import { CartIcon, HeartIcon } from "../icons";

export function ProductCard({
  product,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
}: {
  product: Product;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onAddToCart?: () => void;
}) {
  const wasPrice =
    product.discountPercentage > 0
      ? product.price / (1 - product.discountPercentage / 100)
      : null;
  const lowStock = product.stock <= 20 && product.stock > 0;

  return (
    <article className="pcard">
      <Link to={`/products/${product.id}`} className="pcard-media">
        <img src={product.thumbnail} alt={product.title} loading="lazy" />
        <div className="pcard-badges">
          {wasPrice && (
            <Badge tone="danger">
              −{Math.round(product.discountPercentage)}%
            </Badge>
          )}
          {lowStock && <Badge tone="warning">Only {product.stock} left</Badge>}
          {product.stock === 0 && <Badge tone="neutral">Out of stock</Badge>}
        </div>
        <button
          className={"pcard-fav" + (isFavorite ? " is-on" : "")}
          onClick={(e) => {
            e.preventDefault();
            onToggleFavorite?.();
          }}
          aria-label="Toggle favorite"
          aria-pressed={isFavorite}
        >
          <HeartIcon />
        </button>
      </Link>
      <div className="pcard-body">
        <div className="pcard-brand">{product.brand || "—"}</div>
        <Link to={`/products/${product.id}`} className="pcard-title">
          {product.title}
        </Link>
        <div className="pcard-meta">
          <Rating value={product.rating} showValue size={12} />
          <span className="pcard-cat">· {product.category.replace(/-/g, " ")}</span>
        </div>
        <div className="pcard-foot">
          <div className="pcard-price">
            <span className="pcard-price-now">${product.price.toFixed(2)}</span>
            {wasPrice && (
              <span className="pcard-price-was">${wasPrice.toFixed(2)}</span>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<CartIcon />}
            onClick={onAddToCart}
            disabled={product.stock === 0}
          >
            Add
          </Button>
        </div>
      </div>
    </article>
  );
}
