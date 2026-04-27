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

export function Cart() {
  const [items, setItems] = useState(STARTER_ITEMS);

  const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
  const shipping = subtotal >= 50 ? 0 : 5.99;
  const tax = subtotal * 0.0875;
  const total = subtotal + shipping + tax;

  if (items.length === 0) {
    return (
      <Layout>
        <div className="cart-shell">
          <EmptyState
            icon={<CartIcon width={32} height={32} />}
            title="Your cart is empty"
            description="Add something nice. There's a 30-day return policy if you change your mind."
            action={
              <Link to="/products">
                <Button iconRight={<ChevronRightIcon />}>Browse products</Button>
              </Link>
            }
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="cart">
        <h1>
          Your cart{" "}
          <Badge tone="neutral">
            {items.length} item{items.length === 1 ? "" : "s"}
          </Badge>
        </h1>
        <div className="cart-grid">
          <ul className="cart-items">
            {items.map((it) => (
              <li key={it.id} className="cart-item">
                <img src={it.thumb} alt={it.title} className="cart-thumb" />
                <div className="cart-item-body">
                  <div className="cart-item-brand">{it.brand}</div>
                  <Link to={`/products/${it.id}`} className="cart-item-title">
                    {it.title}
                  </Link>
                  <div className="cart-item-meta">
                    <div className="qty">
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
                      >
                        <MinusIcon width={12} height={12} />
                      </button>
                      <span>{it.qty}</span>
                      <button
                        aria-label="Increase quantity"
                        onClick={() =>
                          setItems((arr) =>
                            arr.map((x) =>
                              x.id === it.id ? { ...x, qty: x.qty + 1 } : x,
                            ),
                          )
                        }
                      >
                        <PlusIcon width={12} height={12} />
                      </button>
                    </div>
                    <button
                      className="cart-remove"
                      onClick={() =>
                        setItems((arr) => arr.filter((x) => x.id !== it.id))
                      }
                    >
                      <TrashIcon width={14} height={14} /> Remove
                    </button>
                  </div>
                </div>
                <div className="cart-item-price">
                  ${(it.price * it.qty).toFixed(2)}
                </div>
              </li>
            ))}
          </ul>

          <aside className="cart-summary">
            <Card title="Order summary" elevated>
              <ul className="summary-rows">
                <li>
                  <span>Subtotal</span>
                  <span className="mono">${subtotal.toFixed(2)}</span>
                </li>
                <li>
                  <span>
                    Shipping{" "}
                    {shipping === 0 && <Badge tone="success">free</Badge>}
                  </span>
                  <span className="mono">
                    {shipping === 0 ? "—" : "$" + shipping.toFixed(2)}
                  </span>
                </li>
                <li>
                  <span>Tax (est.)</span>
                  <span className="mono">${tax.toFixed(2)}</span>
                </li>
                <li className="summary-total">
                  <span>Total</span>
                  <span className="mono">${total.toFixed(2)}</span>
                </li>
              </ul>

              <div className="promo">
                <input type="text" placeholder="Promo code" />
                <Button size="sm" variant="outline">Apply</Button>
              </div>
              <Button size="lg" fullWidth iconRight={<ChevronRightIcon />}>
                Checkout
              </Button>
              <p className="summary-note">Secure checkout · Powered by Stripe</p>
            </Card>
          </aside>
        </div>
      </div>
    </Layout>
  );
}
