type StatCardProps = {
  label: string;
  value: string;
  delta?: number;
};

export function StatCard({ label, value, delta }: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e6e9ef",
        borderRadius: 8,
        padding: 18,
      }}
    >
      <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
      {typeof delta === "number" && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: positive ? "#23a559" : "#d23a3a",
          }}
        >
          {positive ? "▲" : "▼"} {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
}
