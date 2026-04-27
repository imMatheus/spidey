import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import {
  ChevronRightIcon,
  LayoutIcon,
  PackageIcon,
  SparkIcon,
} from "../icons";

const FEATURES = [
  {
    icon: <SparkIcon width={20} height={20} />,
    title: "Instant capture",
    body: "Walk through your app once; Lattice freezes every screen as an editable tile.",
  },
  {
    icon: <PackageIcon width={20} height={20} />,
    title: "Component-aware",
    body: "Edits made on a master propagate to every instance across every page.",
  },
  {
    icon: <LayoutIcon width={20} height={20} />,
    title: "Real CSS",
    body: "No translation layer. The styles you write are the styles your app ships.",
  },
];

const TESTIMONIALS = [
  {
    name: "Riley Vance",
    role: "Design lead, Northwave",
    quote:
      "Cut our redline cycle from days to a single afternoon. Engineering pushed merged styles the same evening.",
  },
  {
    name: "Mei Tanaka",
    role: "Frontend, Halycon",
    quote:
      "I edit our real components, not a Figma cosplay. The diff lands on the right file every time.",
  },
  {
    name: "Aaron Boyd",
    role: "PM, Drift Labs",
    quote: "Finally a tool that respects that production already exists.",
  },
];

export function Home() {
  return (
    <Layout>
      <section className="hero">
        <div className="hero-inner">
          <Badge tone="brand" dot>
            v0.1 preview
          </Badge>
          <h1 className="hero-title">Edit your live app like a Figma file.</h1>
          <p className="hero-lede">
            Lattice walks every route, captures the rendered DOM, and hands you
            a board of design tiles. Move, restyle, even rewrite content — then
            sync the diff back to your real code.
          </p>
          <div className="hero-cta">
            <Button size="lg" iconRight={<ChevronRightIcon />}>
              Get started
            </Button>
            <Button size="lg" variant="ghost">
              View on GitHub
            </Button>
          </div>
          <div className="hero-meta">
            <span className="hero-meta-item">
              <span className="hero-meta-dot dot-emerald" /> 12k weekly captures
            </span>
            <span className="hero-meta-item">
              <span className="hero-meta-dot dot-amber" /> 3.4k design teams
            </span>
            <span className="hero-meta-item">
              <span className="hero-meta-dot dot-violet" /> 41 frameworks
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden>
          <div className="hero-art-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="hero-art-tile"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Why Lattice</h2>
          <p className="section-lede">
            Built so the design surface is the codebase, not a parallel world.
          </p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <Card key={f.title} hoverable>
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <p className="feature-body">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Designers ship faster</h2>
          <p className="section-lede">
            A few teams that switched off the redline shuffle.
          </p>
        </div>
        <div className="testimonial-grid">
          {TESTIMONIALS.map((t) => (
            <Card key={t.name} elevated>
              <p className="testimonial-quote">"{t.quote}"</p>
              <div className="testimonial-byline">
                <Avatar name={t.name} size="sm" />
                <div>
                  <div className="testimonial-name">{t.name}</div>
                  <div className="testimonial-role">{t.role}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="cta">
        <div className="cta-inner">
          <h2>Try it on your own repo.</h2>
          <p>One command. No config.</p>
          <pre className="cta-code">
            <code>$ bunx lattice generate</code>
          </pre>
          <div className="cta-row">
            <Link to="/products" className="cta-link">
              Browse the demo store →
            </Link>
            <Link to="/dashboard" className="cta-link">
              Open the demo dashboard →
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
