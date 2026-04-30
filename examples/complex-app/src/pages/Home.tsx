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
    name: "Jordan Park",
    role: "Staff engineer, Pinecrest",
    quote:
      "Our marketing site used to need a sprint per refresh. Now product can iterate live and we just review the PR.",
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
      <section className="grid grid-cols-[1.1fr_1fr] gap-10 items-center pt-14 pb-10">
        <div>
          <Badge tone="brand" dot>
            v0.1 preview
          </Badge>
          <h1 className="text-5xl leading-[1.05] tracking-tight my-4 text-zinc-900 dark:text-zinc-100">
            Edit your live app like a Figma file.
          </h1>
          <p className="text-lg leading-relaxed text-zinc-500 dark:text-zinc-400 max-w-[540px] mt-0 mb-7">
            Edit your live app visually and sync changes back to code.
          </p>
          <div className="flex gap-3">
            <Button size="lg" iconRight={<ChevronRightIcon />}>
              Get started
            </Button>
            <Button size="lg" variant="ghost">
              View on GitHub
            </Button>
          </div>
          <div className="flex gap-6 mt-8 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block bg-emerald-500" />{" "}
              12k weekly captures
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block bg-amber-500" />{" "}
              3.4k design teams
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block bg-violet-500" />{" "}
              41 frameworks
            </span>
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl p-6 aspect-[1.1] grid place-items-center bg-gradient-to-br from-[#1e1b3a] via-indigo-600 to-fuchsia-300"
          aria-hidden
        >
          <div className="grid grid-cols-4 gap-3 w-full h-full">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="bg-white/10 border border-white/20 rounded-lg [animation:pulse-tile_3s_ease-in-out_infinite]"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="text-center mb-8">
          <h2 className="text-[28px] my-0 mb-2 text-zinc-900 dark:text-zinc-100 font-semibold">
            Why Lattice
          </h2>
          <p className="text-[15px] text-zinc-500 dark:text-zinc-400 mx-auto max-w-[540px]">
            Built so the design surface is the codebase, not a parallel world.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <Card key={f.title} hoverable>
              <div className="w-10 h-10 grid place-items-center bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 rounded-lg">
                {f.icon}
              </div>
              <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {f.title}
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 m-0 leading-relaxed">
                {f.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="py-10">
        <div className="text-center mb-8">
          <h2 className="text-[28px] my-0 mb-2 text-zinc-900 dark:text-zinc-100 font-semibold">
            Designers ship faster
          </h2>
          <p className="text-[15px] text-zinc-500 dark:text-zinc-400 mx-auto max-w-[540px]">
            A few teams that switched off the redline shuffle.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {TESTIMONIALS.map((t) => (
            <Card key={t.name} elevated>
              <p className="text-[15px] leading-relaxed m-0 mb-4 text-zinc-800 dark:text-zinc-200">
                "{t.quote}"
              </p>
              <div className="flex items-center gap-2.5">
                <Avatar name={t.name} size="sm" />
                <div>
                  <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.name}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t.role}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="my-12 bg-gradient-to-br from-[#15172b] to-[#2d2a5f] rounded-2xl p-12 text-white text-center">
        <div>
          <h2 className="text-[28px] m-0 mb-1.5 font-semibold">
            Try it on your own repo.
          </h2>
          <p className="text-white/70 m-0 mb-5">One command. No config.</p>
          <pre className="inline-block bg-black/40 border border-white/10 px-4 py-2.5 rounded-lg font-mono text-[13px] m-0 mb-5">
            <code>$ bunx lattice generate</code>
          </pre>
          <div className="flex gap-6 justify-center">
            <Link
              to="/products"
              className="text-white/85 hover:text-white no-underline text-sm"
            >
              Browse the demo store →
            </Link>
            <Link
              to="/dashboard"
              className="text-white/85 hover:text-white no-underline text-sm"
            >
              Open the demo dashboard →
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
