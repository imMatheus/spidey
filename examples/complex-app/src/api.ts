import type { Product, ProductsResponse } from "./types";

const BASE = "https://dummyjson.com";

export async function fetchProducts(
  opts: {
    skip?: number;
    limit?: number;
    category?: string;
    query?: string;
  } = {},
): Promise<ProductsResponse> {
  const { skip = 0, limit = 12, category, query } = opts;
  let url: string;
  if (query) {
    url = `${BASE}/products/search?q=${encodeURIComponent(query)}&limit=${limit}&skip=${skip}`;
  } else if (category && category !== "all") {
    url = `${BASE}/products/category/${encodeURIComponent(category)}?limit=${limit}&skip=${skip}`;
  } else {
    url = `${BASE}/products?limit=${limit}&skip=${skip}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ProductsResponse>;
}

export async function fetchProduct(id: string | number): Promise<Product> {
  const res = await fetch(`${BASE}/products/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Product>;
}

export async function fetchCategories(): Promise<string[]> {
  const res = await fetch(`${BASE}/products/category-list`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<string[]>;
}
