import Link from "next/link";

const posts = [
  { slug: "hello-world", title: "Hello, world", excerpt: "An obligatory first post." },
  { slug: "shipping-fast", title: "Shipping fast", excerpt: "How we cut deploys to 4 minutes." },
  { slug: "design-systems", title: "On design systems", excerpt: "Why we maintain ours by hand." },
];

export default function Blog() {
  return (
    <div>
      <h1>Blog</h1>
      <p>Stories from the Globex engineering org.</p>
      <div className="posts">
        {posts.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="post-link">
            <h3>{p.title}</h3>
            <p>{p.excerpt}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
