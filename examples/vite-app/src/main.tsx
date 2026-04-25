import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useParams } from "react-router-dom";
import "./styles.css";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <nav className="nav">
        <Link to="/" className="brand">acme</Link>
        <Link to="/about">About</Link>
        <Link to="/products">Products</Link>
        <Link to="/users/42">Profile</Link>
      </nav>
      <main className="main">{children}</main>
      <footer className="footer">© Acme · vite + react-router</footer>
    </div>
  );
}

function Home() {
  return (
    <Layout>
      <h1>Welcome to Acme</h1>
      <p className="lead">
        A demo Vite app for testing Spidey. Each link is a different route.
      </p>
      <div className="card-grid">
        <div className="card">
          <h3>Fast</h3>
          <p>HMR, instant cold starts.</p>
        </div>
        <div className="card">
          <h3>Typed</h3>
          <p>TypeScript end-to-end.</p>
        </div>
        <div className="card">
          <h3>Composable</h3>
          <p>Bring your own routing, state, styling.</p>
        </div>
      </div>
    </Layout>
  );
}

function About() {
  return (
    <Layout>
      <h1>About</h1>
      <p>Acme is a fictional company that exists only inside this demo.</p>
      <ul>
        <li>Founded in 2026</li>
        <li>Headquartered nowhere</li>
        <li>Specializes in stress-testing canvas viewers</li>
      </ul>
    </Layout>
  );
}

function Products() {
  const items = [
    { id: 1, name: "Widget", price: "$10" },
    { id: 2, name: "Gizmo", price: "$25" },
    { id: 3, name: "Doohickey", price: "$8" },
  ];
  return (
    <Layout>
      <h1>Products</h1>
      <table className="tbl">
        <thead>
          <tr><th>Name</th><th>Price</th></tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.name}</td>
              <td>{it.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  );
}

function User() {
  const { id } = useParams();
  return (
    <Layout>
      <h1>User #{id}</h1>
      <div className="profile">
        <div className="avatar">{(id ?? "?").slice(0, 1).toUpperCase()}</div>
        <div>
          <h2>User {id}</h2>
          <p className="dim">Joined recently · Active member</p>
        </div>
      </div>
    </Layout>
  );
}

function NotFound() {
  return (
    <Layout>
      <h1>404</h1>
      <p>Page not found.</p>
    </Layout>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/products" element={<Products />} />
        <Route path="/users/:id" element={<User />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
