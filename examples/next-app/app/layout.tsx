import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "Globex Demo",
  description: "Spidey demo Next App Router",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="brand">globex</Link>
          <Link href="/about">About</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/blog/hello-world">Sample Post</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
        <main className="main">{children}</main>
        <footer className="footer">© Globex · next.js app router</footer>
      </body>
    </html>
  );
}
