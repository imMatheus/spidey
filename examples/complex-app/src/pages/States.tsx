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

export function States() {
  const [tab, setTab] = useState("a");
  const [toggle, setToggle] = useState(true);
  return (
    <Layout>
      <h1>Component states</h1>
      <p className="lead">Every variant of every component, side-by-side.</p>

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
          <Badge tone="success" dot>Active</Badge>
          <Badge tone="warning" dot>Pending</Badge>
          <Badge tone="danger" dot>Failed</Badge>
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
          <Toggle checked={toggle} onChange={setToggle} label="Notifications" />
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
        <div className="stat-grid">
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
        <div className="row-grid">
          <Card title="Plain" subtitle="With header">
            <p>Body content goes here.</p>
          </Card>
          <Card title="Hoverable" hoverable>
            <p>Hovers respond.</p>
          </Card>
          <Card title="Elevated" elevated subtitle="Bigger shadow">
            <p>Lifted.</p>
          </Card>
          <Card footer={<Button size="sm">Action</Button>}>
            <p>No header, has footer.</p>
          </Card>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="form-grid">
          <Card title="Inputs">
            <div className="form-row">
              <label>Text</label>
              <input type="text" placeholder="Type here" />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input type="email" placeholder="you@example.com" />
            </div>
            <div className="form-row">
              <label>Number</label>
              <input type="number" defaultValue={42} />
            </div>
            <div className="form-row">
              <label>Password</label>
              <input type="password" defaultValue="secret" />
            </div>
            <div className="form-row">
              <label>Date</label>
              <input type="date" />
            </div>
            <div className="form-row">
              <label>Disabled</label>
              <input type="text" defaultValue="frozen" disabled />
            </div>
            <div className="form-row">
              <label>Error</label>
              <input
                type="text"
                className="has-error"
                defaultValue="bad input"
              />
            </div>
          </Card>
          <Card title="Selects, textarea, checks">
            <div className="form-row">
              <label>Select</label>
              <select>
                <option>Option A</option>
                <option>Option B</option>
                <option>Option C</option>
              </select>
            </div>
            <div className="form-row">
              <label>Textarea</label>
              <textarea
                rows={4}
                defaultValue="A multi-line input. Resize me."
              />
            </div>
            <div className="form-row">
              <label>Range</label>
              <input type="range" defaultValue={60} />
            </div>
            <div className="form-row checkbox-row-inline">
              <label className="checkbox-row">
                <input type="checkbox" defaultChecked /> <span>Checkbox A</span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" /> <span>Checkbox B</span>
              </label>
            </div>
            <div className="form-row checkbox-row-inline">
              <label className="checkbox-row">
                <input type="radio" name="r" defaultChecked />{" "}
                <span>Radio A</span>
              </label>
              <label className="checkbox-row">
                <input type="radio" name="r" /> <span>Radio B</span>
              </label>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="Empty / loading / error">
        <div className="row-grid">
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
          <p className="truncate-line">
            Truncated single line — Lorem ipsum dolor sit amet consectetur
            adipisicing elit. Sed do eiusmod tempor incididunt ut labore et
            dolore magna aliqua.
          </p>
          <p>
            Multi-line wrap — Lorem ipsum dolor sit amet, consectetur
            adipisicing elit, sed do eiusmod tempor incididunt ut labore et
            dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
            exercitation ullamco laboris nisi ut aliquip ex ea commodo
            consequat.
          </p>
          <p className="break-word">
            Long-word —
            pneumonoultramicroscopicsilicovolcanoconiosishypothetical
            antidisestablishmentarianism
            floccinaucinihilipilificationextended
          </p>
        </Card>
      </Section>

      <Section title="Tooltip / popover (CSS-only)">
        <Row>
          <span className="tip" data-tip="A simple tooltip">
            <Button variant="ghost">Hover me</Button>
          </span>
          <span className="tip" data-tip="Aligned to the right">
            <Badge tone="info">i</Badge>
          </span>
          <span
            className="tip"
            data-tip="Even longer copy that probably wraps onto a second line in some places"
          >
            <Avatar name="Tip Boy" size="md" />
          </span>
        </Row>
      </Section>

      <Section title="Z-index stacking">
        <div className="stack-demo">
          <div className="stack-card stack-1">Layer 1 (z=1)</div>
          <div className="stack-card stack-2">Layer 2 (z=5)</div>
          <div className="stack-card stack-3">Layer 3 (z=10)</div>
        </div>
      </Section>
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="state-sec">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="state-row">{children}</div>;
}
