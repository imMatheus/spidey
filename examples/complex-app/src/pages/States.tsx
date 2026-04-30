import type { ReactNode } from "react";
import { useState } from "react";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Avatar } from "../components/Avatar";
import { Card } from "../components/Card";
import { Tabs } from "../components/Tabs";
import { Toggle } from "../components/Toggle";
import { Rating } from "../components/Rating";
import { EmptyState } from "../components/EmptyState";
import { Skeleton, SkeletonText } from "../components/Skeleton";
import { StatCard } from "../components/StatCard";
import {
  AlertIcon,
  BellIcon,
  CartIcon,
  PackageIcon,
  PlusIcon,
  TrendingUpIcon,
} from "../icons";

const FORM_LABEL = "text-xs font-medium text-zinc-500 dark:text-zinc-400";
const INPUT =
  "px-2.5 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md text-[13px] bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";
const INPUT_ERROR =
  "px-2.5 py-2 border border-red-500 rounded-md text-[13px] bg-red-50 dark:bg-red-950/40 text-zinc-900 dark:text-zinc-100";

export function States() {
  const [tab, setTab] = useState("a");
  const [toggle, setToggle] = useState(true);
  return (
    <Layout>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-2 mb-2">
        Component states
      </h1>
      <p className="text-zinc-500 dark:text-zinc-400 text-base max-w-[640px]">
        Every variant of every component, side-by-side.
      </p>

      <Section title="Buttons — variants">
        <Row>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </Row>
        <Row>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </Row>
        <Row>
          <Button iconLeft={<PlusIcon />}>With icon</Button>
          <Button iconRight={<CartIcon />} variant="secondary">
            Right icon
          </Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </Row>
      </Section>

      <Section title="Badges">
        <Row>
          <Badge tone="success" dot>
            Active
          </Badge>
          <Badge tone="warning" dot>
            Pending
          </Badge>
          <Badge tone="danger" dot>
            Failed
          </Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="brand">Pro</Badge>
          <Badge tone="neutral">Draft</Badge>
        </Row>
      </Section>

      <Section title="Avatars">
        <Row>
          <Avatar name="Ava Lin" size="sm" />
          <Avatar name="Ben Cox" size="md" />
          <Avatar name="Cara Ng" size="lg" />
          <Avatar name="Dane Roy" size="xl" />
          <Avatar name="Eli Rae" size="md" status="online" />
          <Avatar name="Faye Bo" size="md" status="busy" />
          <Avatar name="Gus Wei" size="md" status="away" />
          <Avatar name="Hi Mira" size="md" status="offline" />
          <Avatar name="Jo Park" size="md" shape="square" />
        </Row>
      </Section>

      <Section title="Tabs & toggles">
        <Tabs
          tabs={[
            { id: "a", label: "First" },
            { id: "b", label: "Second" },
            { id: "c", label: "Third" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Row>
          <Toggle
            checked={toggle}
            onChange={setToggle}
            label="Notifications"
          />
          <Toggle checked={false} onChange={() => {}} label="Off" />
          <Toggle
            checked={true}
            onChange={() => {}}
            label="Disabled on"
            disabled
          />
        </Row>
      </Section>

      <Section title="Ratings">
        <Row>
          <Rating value={5} showValue />
          <Rating value={4.2} showValue />
          <Rating value={3.5} showValue />
          <Rating value={2} showValue />
          <Rating value={0.5} showValue />
          <Rating value={0} showValue />
        </Row>
      </Section>

      <Section title="Stat cards">
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Revenue"
            value="$48,209"
            delta="+12.4%"
            trend="up"
            icon={<TrendingUpIcon />}
          />
          <StatCard
            label="Churn"
            value="2.1%"
            delta="−0.4%"
            trend="down"
            icon={<AlertIcon />}
          />
          <StatCard
            label="Tickets"
            value="38"
            delta="no change"
            trend="flat"
            icon={<BellIcon />}
          />
          <StatCard label="Inventory" value="1,420" icon={<PackageIcon />} />
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          <Card title="Plain" subtitle="With header">
            <p className="text-zinc-700 dark:text-zinc-300 text-sm m-0">
              Body content goes here.
            </p>
          </Card>
          <Card title="Hoverable" hoverable>
            <p className="text-zinc-700 dark:text-zinc-300 text-sm m-0">
              Hovers respond.
            </p>
          </Card>
          <Card title="Elevated" elevated subtitle="Bigger shadow">
            <p className="text-zinc-700 dark:text-zinc-300 text-sm m-0">
              Lifted.
            </p>
          </Card>
          <Card footer={<Button size="sm">Action</Button>}>
            <p className="text-zinc-700 dark:text-zinc-300 text-sm m-0">
              No header, has footer.
            </p>
          </Card>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid grid-cols-2 gap-4">
          <Card title="Inputs">
            {[
              { label: "Text", type: "text", placeholder: "Type here" },
              { label: "Email", type: "email", placeholder: "you@example.com" },
            ].map((f) => (
              <div key={f.label} className="flex flex-col gap-1.5">
                <label className={FORM_LABEL}>{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  className={INPUT}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <label className={FORM_LABEL}>Number</label>
              <input type="number" defaultValue={42} className={INPUT} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={FORM_LABEL}>Password</label>
              <input
                type="password"
                defaultValue="secret"
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={FORM_LABEL}>Date</label>
              <input type="date" className={INPUT} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={FORM_LABEL}>Disabled</label>
              <input
                type="text"
                defaultValue="frozen"
                disabled
                className={`${INPUT} opacity-50 cursor-not-allowed`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={FORM_LABEL}>Error</label>
              <input
                type="text"
                defaultValue="bad input"
                className={INPUT_ERROR}
              />
            </div>
          </Card>
          <Card title="Selects, textarea, checks">
            <div className="flex flex-col gap-1.5">
              <label className={FORM_LABEL}>Select</label>
              <select className={INPUT}>
                <option>Option A</option>
                <option>Option B</option>
                <option>Option C</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={FORM_LABEL}>Textarea</label>
              <textarea
                rows={4}
                defaultValue="A multi-line input. Resize me."
                className={INPUT}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={FORM_LABEL}>Range</label>
              <input
                type="range"
                defaultValue={60}
                className="w-full accent-indigo-500"
              />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="m-0 accent-indigo-500"
                />{" "}
                <span>Checkbox A</span>
              </label>
              <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input type="checkbox" className="m-0 accent-indigo-500" />{" "}
                <span>Checkbox B</span>
              </label>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="r"
                  defaultChecked
                  className="m-0 accent-indigo-500"
                />{" "}
                <span>Radio A</span>
              </label>
              <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  type="radio"
                  name="r"
                  className="m-0 accent-indigo-500"
                />{" "}
                <span>Radio B</span>
              </label>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Empty / loading / error">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          <Card title="Empty">
            <EmptyState
              icon={<PackageIcon width={28} height={28} />}
              title="No items"
              description="Once you ship something, you'll see it here."
              action={<Button size="sm">Add item</Button>}
            />
          </Card>
          <Card title="Loading">
            <SkeletonText lines={4} />
            <div style={{ height: 12 }} />
            <Skeleton width={120} height={28} rounded="md" />
          </Card>
          <Card title="Error">
            <EmptyState
              icon={<AlertIcon width={28} height={28} />}
              title="Something went wrong"
              description="Network error: timeout after 30s."
              action={
                <Button size="sm" variant="outline">
                  Retry
                </Button>
              }
            />
          </Card>
        </div>
      </Section>

      <Section title="Long content">
        <Card>
          <p className="overflow-hidden whitespace-nowrap text-ellipsis text-zinc-700 dark:text-zinc-300 text-sm m-0">
            Truncated single line — Lorem ipsum dolor sit amet consectetur
            adipisicing elit. Sed do eiusmod tempor incididunt ut labore et
            dolore magna aliqua.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300 text-sm m-0">
            Multi-line wrap — Lorem ipsum dolor sit amet, consectetur
            adipisicing elit, sed do eiusmod tempor incididunt ut labore et
            dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
            exercitation ullamco laboris nisi ut aliquip ex ea commodo
            consequat.
          </p>
          <p className="break-all text-zinc-700 dark:text-zinc-300 text-sm m-0">
            Long-word —
            pneumonoultramicroscopicsilicovolcanoconiosishypothetical
            antidisestablishmentarianism
            floccinaucinihilipilificationextended
          </p>
        </Card>
      </Section>

      <Section title="Tooltip / popover (CSS-only)">
        <Row>
          <span className="relative inline-block group">
            <Button variant="ghost">Hover me</Button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1 mb-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] py-1.5 px-2.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-[100] whitespace-nowrap">
              A simple tooltip
            </span>
          </span>
          <span className="relative inline-block group">
            <Badge tone="info">i</Badge>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1 mb-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] py-1.5 px-2.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-[100] whitespace-nowrap">
              Aligned to the right
            </span>
          </span>
          <span className="relative inline-block group">
            <Avatar name="Tip Boy" size="md" />
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1 mb-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] py-1.5 px-2.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-[100] w-max max-w-[240px] text-center">
              Even longer copy that probably wraps onto a second line in some
              places
            </span>
          </span>
        </Row>
      </Section>

      <Section title="Z-index stacking">
        <div className="relative h-36">
          <div className="absolute left-0 top-0 w-[220px] h-[90px] rounded-lg grid place-items-center text-xs font-semibold border border-zinc-200 dark:border-zinc-800 shadow-md bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300 z-[1]">
            Layer 1 (z=1)
          </div>
          <div className="absolute left-[60px] top-5 w-[220px] h-[90px] rounded-lg grid place-items-center text-xs font-semibold border border-zinc-200 dark:border-zinc-800 shadow-md bg-green-50 text-green-600 dark:bg-green-950/60 dark:text-green-400 z-[5]">
            Layer 2 (z=5)
          </div>
          <div className="absolute left-[120px] top-10 w-[220px] h-[90px] rounded-lg grid place-items-center text-xs font-semibold border border-zinc-200 dark:border-zinc-800 shadow-md bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 z-10">
            Layer 3 (z=10)
          </div>
        </div>
      </Section>
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-200 dark:border-zinc-800 py-6 first-of-type:border-t-0">
      <h2 className="text-base text-zinc-900 dark:text-zinc-100 m-0 mb-4 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-3 items-center py-2">{children}</div>
  );
}
