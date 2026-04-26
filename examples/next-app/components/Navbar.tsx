"use client";

import Link from "next/link";

export function Navbar() {
  return (
    <nav className="nav">
      <Link href="/" className="brand">globex</Link>
      <Link href="/about">About</Link>
      <Link href="/blog">Blog</Link>
      <Link href="/blog/hello-world">Sample Post</Link>
      <Link href="/dashboard">Dashboard</Link>
    </nav>
  );
}
