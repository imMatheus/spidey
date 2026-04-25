type Props = { params: { slug: string } };

export default function Post({ params }: Props) {
  return (
    <article>
      <h1>{titleFromSlug(params.slug)}</h1>
      <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px" }}>
        Posted recently · {params.slug}
      </p>
      <p>
        This is a sample blog post rendered from the dynamic route{" "}
        <code>/blog/[slug]</code>. Spidey's placeholder substitution turned
        the route into <code>/blog/example</code> when capturing — it's not
        rocket science, but it works.
      </p>
      <p>
        The next paragraph is filler. Lorem ipsum, but with more self-awareness
        about being filler. Ipsum lorem.
      </p>
    </article>
  );
}

function titleFromSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
