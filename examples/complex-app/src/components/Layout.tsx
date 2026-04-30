import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Avatar } from "./Avatar";
import { BellIcon, CartIcon, MoonIcon, SearchIcon, SunIcon } from "../icons";
import { useTheme } from "../theme";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/products", label: "Products" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/profile", label: "Profile" },
  { to: "/cart", label: "Cart" },
  { to: "/states", label: "States" },
];

const ICON_BTN =
  "w-8 h-8 grid place-items-center bg-transparent border-0 rounded-md text-zinc-700 dark:text-zinc-300 cursor-pointer relative hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors";

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-8 py-3 flex items-center gap-8">
          <NavLink
            to="/"
            className="flex items-center gap-2 no-underline text-zinc-900 dark:text-zinc-100 font-semibold"
          >
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-400 text-white grid place-items-center font-bold text-sm">
              L
            </span>
            <span className="text-[15px] tracking-tight">Lattice</span>
          </NavLink>
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-[13px] font-medium no-underline transition-colors ${
                    isActive
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <button className={ICON_BTN} aria-label="Search">
              <SearchIcon />
            </button>
            <button className={ICON_BTN} aria-label="Notifications">
              <BellIcon />
              <span className="absolute top-1 right-0.5 bg-red-600 text-white rounded-full text-[9px] min-w-[14px] h-3.5 grid place-items-center font-bold px-0.5">
                3
              </span>
            </button>
            <button className={ICON_BTN} aria-label="Cart">
              <CartIcon />
            </button>
            <button
              type="button"
              className={ICON_BTN}
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              onClick={toggle}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <Avatar name="Jamie Park" size="sm" status="online" />
          </div>
        </div>
      </header>
      <main className="flex-1 px-8 pt-6 pb-12 max-w-[1200px] w-full mx-auto">
        {children}
      </main>
      <footer className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-8 py-4 text-xs text-zinc-400 dark:text-zinc-500">
        <div className="max-w-[1200px] mx-auto flex justify-between">
          <span>© 2026 Lattice · synthetic data for Spidey testing</span>
          <span>v0.1.0 · last sync 2m ago</span>
        </div>
      </footer>
    </div>
  );
}
