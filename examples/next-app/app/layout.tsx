import { Navbar } from "../components/Navbar";
import "./globals.css";

export const metadata = {
  title: "Globex Demo",
  description: "Spidey demo Next App Router",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="main">{children}</main>
        <footer className="footer">© Globex · next.js app router</footer>
      </body>
    </html>
  );
}
