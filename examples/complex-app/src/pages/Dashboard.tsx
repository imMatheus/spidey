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

export function Dashboard() {
  return (
    <Layout>
      <div className="dash-head">
        <div>
          <h1>Dashboard</h1>
          <p className="dash-sub">Last 30 days · all stores</p>
        </div>
        <div className="dash-head-actions">
          <Button variant="ghost" size="sm">Export</Button>
          <Button size="sm">+ New report</Button>
        </div>
      </div>

      <div className="stat-grid">
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

      <div className="dash-row">
        <div className="dash-card chart-card">
          <div className="dash-card-head">
            <div>
              <div className="dash-card-title">Revenue by week</div>
              <div className="dash-card-sub">Past 12 weeks</div>
            </div>
            <select className="select-mini">
              <option>Weekly</option>
              <option>Daily</option>
              <option>Monthly</option>
            </select>
          </div>
          <div className="bars">
            {BARS.map((h, i) => (
              <span
                key={i}
                className="bar"
                style={{ height: `${h}%` }}
                title={`Week ${i + 1}: ${h}`}
              />
            ))}
          </div>
          <div className="bars-axis">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i}>W{i + 1}</span>
            ))}
          </div>
        </div>

        <div className="dash-card activity-card">
          <div className="dash-card-head">
            <div className="dash-card-title">Activity</div>
            <a href="#" className="dash-card-link">View all</a>
          </div>
          <ul className="activity">
            {ACTIVITY.map((a, i) => (
              <li key={i}>
                <Avatar name={a.who} size="sm" />
                <div className="activity-body">
                  <div>
                    <strong>{a.who}</strong> {a.what}
                    {a.item && <span className="activity-item"> {a.item}</span>}
                  </div>
                  <span className="activity-when">{a.when}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-head">
          <div className="dash-card-title">Recent transactions</div>
          <Button size="sm" variant="ghost">Filter</Button>
        </div>
        <table className="dash-tbl">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>When</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {TX.map((t) => (
              <tr key={t.id}>
                <td className="mono">{t.id}</td>
                <td>
                  <span className="cell-cust">
                    <Avatar name={t.customer} size="sm" />
                    {t.customer}
                  </span>
                </td>
                <td className="mono">{t.amount}</td>
                <td>
                  <Badge tone={STATUS_TONE[t.status]} dot>
                    {t.status}
                  </Badge>
                </td>
                <td className="dim">{t.when}</td>
                <td>
                  <Button size="sm" variant="ghost">View</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
