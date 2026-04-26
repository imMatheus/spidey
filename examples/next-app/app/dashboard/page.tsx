import { Button } from "../../components/Button";
import { StatCard } from "../../components/StatCard";

export default function Dashboard() {
  const stats = [
    { label: "Active users", value: "12.4k", delta: 8 },
    { label: "Revenue", value: "$8,210", delta: 4 },
    { label: "Uptime", value: "98.2%", delta: -1 },
    { label: "Open tickets", value: "23", delta: -12 },
  ];
  return (
    <div>
      <h1>Dashboard</h1>
      <p>The thing your boss looks at before standup.</p>
      <div className="stat-grid">
        {stats.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            delta={s.delta}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <Button label="Refresh" variant="primary" />
        <Button label="Export" variant="ghost" />
        <Button label="Reset" variant="danger" />
      </div>
    </div>
  );
}
