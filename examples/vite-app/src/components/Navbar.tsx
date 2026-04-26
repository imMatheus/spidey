import { Link } from "react-router-dom";

export function Navbar() {
  return (
    <nav className="nav">
      <Link to="/" className="brand">acme</Link>
      <Link to="/about">About</Link>
      <Link to="/products">Products</Link>
      <Link to="/users/42">Profile</Link>
      <Link to="/longread">Longread</Link>
    </nav>
  );
}
