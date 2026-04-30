import { useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import {
  CartIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
} from "../icons";

const STARTER_ITEMS = [
  {
    id: 1,
    title: "Essence Mascara Lash Princess",
    brand: "Essence",
    price: 9.99,
    qty: 2,
    thumb:
      "https://cdn.dummyjson.com/products/images/beauty/Essence%20Mascara%20Lash%20Princess/1.png",
  },
  {
    id: 2,
    title: "Eyeshadow Palette with Mirror",
    brand: "Glamour Beauty",
    price: 19.99,
    qty: 1,
    thumb:
      "https://cdn.dummyjson.com/products/images/beauty/Eyeshadow%20Palette%20with%20Mirror/1.png",
  },
  {
    id: 3,
    title: "Powder Canister",
    brand: "Velvet Touch",
    price: 14.99,
    qty: 3,
    thumb:
      "https://cdn.dummyjson.com/products/images/beauty/Powder%20Canister/1.png",
  },
];

const QTY_BTN =
  "w-9 h-full bg-transparent border-0 text-zinc-700 dark:text-zinc-300 cursor-pointer grid place-items-center hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800";

export function Cart() {
  const [items, setItems] = useState(STARTER_ITEMS);

  const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
  const shipping = subtotal >= 50 ? 0 : 5.99;
  const tax = subtotal * 0.0875;
  const total = subtotal + shipping + tax;

  if (items.length === 0) {
    return (
      <Layout>
        <div className="py-16 grid place-items-center">
          <EmptyState
            icon={<CartIcon width={32} height={32} />}
            title="Your cart is empty"
            description="Add something nice. There's a 30-day return policy if you change your mind."
            action={
              <Link to="/products">
                <Button iconRight={<ChevronRightIcon />}>
                  Browse products
                </Button>
              </Link>
            }
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        <h1 className="flex items-center gap-2.5 text-[28px] my-4 mb-6 text-zinc-900 dark:text-zinc-100 font-semibold">
          Your cart{" "}
          <Badge tone="neutral">
            {items.length} item{items.length === 1 ? "" : "s"}
          </Badge>
        </h1>
        <div className="grid grid-cols-[1.5fr_1fr] gap-6 items-start">
          <ul className="list-none p-0 m-0 flex flex-col gap-3">
            {items.map((it) => (
              <li
                key={it.id}
                className="grid grid-cols-[80px_1fr_auto] gap-4 items-center p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg"
              >
                <img
                  src={it.thumb}
                  alt={it.title}
                  className="w-20 h-20 object-contain bg-zinc-50 dark:bg-zinc-950 rounded-md"
                />
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {it.brand}
                  </div>
                  <Link
                    to={`/products/${it.id}`}
                    className="text-sm font-medium text-zinc-900 dark:text-zinc-100 no-underline block mt-0.5 mb-1.5"
                  >
                    {it.title}
                  </Link>
                  <div className="flex items-center gap-4">
                    <div className="inline-flex items-center border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 h-8">
                      <button
                        aria-label="Decrease quantity"
                        onClick={() =>
                          setItems((arr) =>
                            arr.map((x) =>
                              x.id === it.id
                                ? { ...x, qty: Math.max(1, x.qty - 1) }
                                : x,
                            ),
                          )
                        }
                        className={QTY_BTN}
                      >
                        <MinusIcon width={12} height={12} />
                      </button>
                      <span className="px-2 min-w-8 text-center font-semibold text-zinc-900 dark:text-zinc-100">
                        {it.qty}
                      </span>
                      <button
                        aria-label="Increase quantity"
                        onClick={() =>
                          setItems((arr) =>
                            arr.map((x) =>
                              x.id === it.id ? { ...x, qty: x.qty + 1 } : x,
                            ),
                          )
                        }
                        className={QTY_BTN}
                      >
                        <PlusIcon width={12} height={12} />
                      </button>
                    </div>
                    <button
                      onClick={() =>
                        setItems((arr) => arr.filter((x) => x.id !== it.id))
                      }
                      className="inline-flex items-center gap-1 border-0 bg-transparent text-zinc-400 dark:text-zinc-500 text-xs cursor-pointer hover:text-red-600 dark:hover:text-red-400"
                    >
                      <TrashIcon width={14} height={14} /> Remove
                    </button>
                  </div>
                </div>
                <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  ${(it.price * it.qty).toFixed(2)}
                </div>
              </li>
            ))}
          </ul>

          <aside className="sticky top-20">
            <Card title="Order summary" elevated>
              <ul className="list-none p-0 m-0 flex flex-col">
                <li className="flex justify-between items-center py-2.5 text-sm text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800">
                  <span>Subtotal</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">
                    ${subtotal.toFixed(2)}
                  </span>
                </li>
                <li className="flex justify-between items-center py-2.5 text-sm text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800">
                  <span className="flex items-center gap-1.5">
                    Shipping{" "}
                    {shipping === 0 && <Badge tone="success">free</Badge>}
                  </span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">
                    {shipping === 0 ? "—" : "$" + shipping.toFixed(2)}
                  </span>
                </li>
                <li className="flex justify-between items-center py-2.5 text-sm text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-800">
                  <span>Tax (est.)</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">
                    ${tax.toFixed(2)}
                  </span>
                </li>
                <li className="flex justify-between items-center py-2.5 pt-3 text-base font-bold text-zinc-900 dark:text-zinc-100">
                  <span>Total</span>
                  <span className="font-mono">${total.toFixed(2)}</span>
                </li>
              </ul>

              <div className="flex gap-2 my-3">
                <input
                  type="text"
                  placeholder="Promo code"
                  className="flex-1 px-2.5 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-md text-[13px] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <Button size="sm" variant="outline">
                  Apply
                </Button>
              </div>
              <Button size="lg" fullWidth iconRight={<ChevronRightIcon />}>
                Checkout
              </Button>
              <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 mt-3 mb-0">
                Secure checkout · Powered by Stripe
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </Layout>
  );
}
