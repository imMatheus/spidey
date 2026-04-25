export default function Dashboard() {
  const stats = [
    { num: "12.4k", label: "Active users" },
    { num: "$8,210", label: "Revenue" },
    { num: "98.2%", label: "Uptime" },
    { num: "23", label: "Open tickets" },
  ];
  return (
    <div>
      <h1>Dashboard</h1>
      <p>The thing your boss looks at before standup.</p>
      <div className="stat-grid">
        {stats.map((s) => (
          <div key={s.label} className="stat">
            <div className="num">{s.num}</div>
            <div className="label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
