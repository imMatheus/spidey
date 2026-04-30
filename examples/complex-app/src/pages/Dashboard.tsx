import { Layout } from "../components/Layout";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/Badge";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import {
  CartIcon,
  PackageIcon,
  TrendingUpIcon,
  UserIcon,
} from "../icons";

type TxStatus = "paid" | "pending" | "refunded" | "failed";
type Tone = "success" | "warning" | "info" | "danger";

const TX: { id: string; customer: string; amount: string; status: TxStatus; when: string }[] = [
  { id: "TX-1042", customer: "Mira Falk", amount: "$248.00", status: "paid", when: "2m ago" },
  { id: "TX-1041", customer: "Hugo Wells", amount: "$84.50", status: "paid", when: "11m ago" },
  { id: "TX-1040", customer: "Ines Ortega", amount: "$1,290.00", status: "pending", when: "31m ago" },
  { id: "TX-1039", customer: "Felix Sato", amount: "$22.00", status: "refunded", when: "1h ago" },
  { id: "TX-1038", customer: "Yara Bloom", amount: "$413.20", status: "paid", when: "2h ago" },
  { id: "TX-1037", customer: "Devin Park", amount: "$78.00", status: "failed", when: "3h ago" },
];

const STATUS_TONE: Record<TxStatus, Tone> = {
  paid: "success",
  pending: "warning",
  refunded: "info",
  failed: "danger",
};

const ACTIVITY = [
  { who: "Mira Falk", what: "placed an order", item: "Smartphone S24", when: "2m" },
  { who: "Lattice", what: "deployed v0.1.0 to staging", item: "", when: "14m" },
  { who: "Felix Sato", what: "requested a refund", item: "Headphones P12", when: "1h" },
  { who: "Yara Bloom", what: "wrote a review", item: "Sneakers AT4", when: "2h" },
  { who: "Devin Park", what: "abandoned a cart", item: "$78 worth", when: "3h" },
];

const BARS = [40, 65, 32, 78, 92, 51, 88, 70, 60, 95, 82, 73];

const DASH_CARD =
  "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-[18px]";

export function Dashboard() {
  return (
    <Layout>
      <div className="flex justify-between items-end pt-2 pb-6">
        <div>
          <h1 className="m-0 text-[28px] tracking-tight text-zinc-900 dark:text-zinc-100 font-semibold">
            Dashboard
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 mb-0">
            Last 30 days · all stores
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm">
            Export
          </Button>
          <Button size="sm">+ New report</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <StatCard
          label="Revenue"
          value="$48,209"
          delta="+12.4% vs last month"
          trend="up"
          icon={<TrendingUpIcon />}
        />
        <StatCard
          label="Orders"
          value="1,284"
          delta="+5.1%"
          trend="up"
          icon={<CartIcon />}
        />
        <StatCard
          label="New users"
          value="312"
          delta="−2.3%"
          trend="down"
          icon={<UserIcon />}
        />
        <StatCard
          label="Stock alerts"
          value="7"
          delta="3 new"
          trend="flat"
          icon={<PackageIcon />}
        />
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-4 mb-4">
        <div className={DASH_CARD}>
          <div className="flex justify-between items-center mb-3.5">
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Revenue by week
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Past 12 weeks
              </div>
            </div>
            <select className="px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
              <option>Weekly</option>
              <option>Daily</option>
              <option>Monthly</option>
            </select>
          </div>
          <div className="flex gap-2 items-end h-44 py-3">
            {BARS.map((h, i) => (
              <span
                key={i}
                className="flex-1 bg-gradient-to-b from-indigo-300 to-indigo-500 dark:from-indigo-400 dark:to-indigo-600 rounded-t-md min-h-[4px]"
                style={{ height: `${h}%` }}
                title={`Week ${i + 1}: ${h}`}
              />
            ))}
          </div>
          <div className="flex gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="flex-1 text-center">
                W{i + 1}
              </span>
            ))}
          </div>
        </div>

        <div className={DASH_CARD}>
          <div className="flex justify-between items-center mb-3.5">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Activity
            </div>
            <a
              href="#"
              className="text-indigo-600 dark:text-indigo-400 no-underline text-xs"
            >
              View all
            </a>
          </div>
          <ul className="list-none p-0 m-0 flex flex-col gap-3.5">
            {ACTIVITY.map((a, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <Avatar name={a.who} size="sm" />
                <div className="flex-1 text-[13px] text-zinc-700 dark:text-zinc-300 flex justify-between items-baseline gap-3">
                  <div>
                    <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">
                      {a.who}
                    </strong>{" "}
                    {a.what}
                    {a.item && (
                      <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                        {" "}
                        {a.item}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                    {a.when}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={DASH_CARD}>
        <div className="flex justify-between items-center mb-3.5">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Recent transactions
          </div>
          <Button size="sm" variant="ghost">
            Filter
          </Button>
        </div>
        <table className="w-full border-collapse">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              {["Order", "Customer", "Amount", "Status", "When", ""].map(
                (h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {TX.map((t) => (
              <tr
                key={t.id}
                className="border-b border-zinc-200 dark:border-zinc-800 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              >
                <td className="px-3 py-2.5 text-[13px] font-mono text-zinc-900 dark:text-zinc-100">
                  {t.id}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-zinc-900 dark:text-zinc-100">
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={t.customer} size="sm" />
                    {t.customer}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[13px] font-mono text-zinc-900 dark:text-zinc-100">
                  {t.amount}
                </td>
                <td className="px-3 py-2.5 text-[13px]">
                  <Badge tone={STATUS_TONE[t.status]} dot>
                    {t.status}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-[13px] text-zinc-400 dark:text-zinc-500">
                  {t.when}
                </td>
                <td className="px-3 py-2.5 text-[13px]">
                  <Button size="sm" variant="ghost">
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
