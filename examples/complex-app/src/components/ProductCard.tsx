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
    <article className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <Link
        to={`/products/${product.id}`}
        className="relative aspect-[1.1] block bg-zinc-50 dark:bg-zinc-950"
      >
        <img
          src={product.thumbnail}
          alt={product.title}
          loading="lazy"
          className="w-full h-full object-contain p-3"
        />
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
          {wasPrice && (
            <Badge tone="danger">
              −{Math.round(product.discountPercentage)}%
            </Badge>
          )}
          {lowStock && <Badge tone="warning">Only {product.stock} left</Badge>}
          {product.stock === 0 && <Badge tone="neutral">Out of stock</Badge>}
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            onToggleFavorite?.();
          }}
          aria-label="Toggle favorite"
          aria-pressed={isFavorite}
          className={`absolute top-2 right-2 w-7 h-7 rounded-full grid place-items-center cursor-pointer transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5 ${
            isFavorite
              ? "bg-red-50 text-red-600 border border-transparent dark:bg-red-950/60 [&>svg]:fill-current"
              : "bg-white dark:bg-zinc-900 text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:text-red-600"
          }`}
        >
          <HeartIcon />
        </button>
      </Link>
      <div className="p-3 pb-3.5 flex flex-col gap-1 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-semibold">
          {product.brand || "—"}
        </div>
        <Link
          to={`/products/${product.id}`}
          className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 line-clamp-2"
        >
          {product.title}
        </Link>
        <div className="text-[11px] flex items-center gap-1 text-zinc-500 dark:text-zinc-400 capitalize">
          <Rating value={product.rating} showValue size={12} />
          <span className="whitespace-nowrap overflow-hidden text-ellipsis">
            · {product.category.replace(/-/g, " ")}
          </span>
        </div>
        <div className="mt-auto flex justify-between items-center pt-1.5">
          <div>
            <span className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              ${product.price.toFixed(2)}
            </span>
            {wasPrice && (
              <span className="text-xs line-through text-zinc-400 dark:text-zinc-500 ml-1">
                ${wasPrice.toFixed(2)}
              </span>
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
