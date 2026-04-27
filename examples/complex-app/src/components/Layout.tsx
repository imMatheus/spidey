import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Avatar } from "./Avatar";
import { BellIcon, CartIcon, SearchIcon } from "../icons";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/products", label: "Products" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/profile", label: "Profile" },
  { to: "/cart", label: "Cart" },
  { to: "/states", label: "States" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <span className="brand-mark">L</span>
            <span className="brand-name">Lattice</span>
          </NavLink>
          <nav className="nav">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  "nav-link" + (isActive ? " is-active" : "")
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-actions">
            <button className="icon-btn" aria-label="Search">
              <SearchIcon />
            </button>
            <button className="icon-btn icon-btn-badged" aria-label="Notifications">
              <BellIcon />
              <span className="icon-btn-dot">3</span>
            </button>
            <button className="icon-btn" aria-label="Cart">
              <CartIcon />
            </button>
            <Avatar name="Jamie Park" size="sm" status="online" />
          </div>
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">
        <div className="footer-inner">
          <span>© 2026 Lattice · synthetic data for Spidey testing</span>
          <span className="footer-meta">v0.1.0 · last sync 2m ago</span>
        </div>
      </footer>
    </div>
  );
}
