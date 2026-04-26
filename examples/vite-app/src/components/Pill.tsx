type PillProps = {
  label: string;
  tone?: "info" | "warn" | "ok";
};

const palette: Record<NonNullable<PillProps["tone"]>, { bg: string; fg: string }> = {
  info: { bg: "#e6efff", fg: "#1a55c4" },
  warn: { bg: "#fff3cd", fg: "#8a6300" },
  ok: { bg: "#dcf6e3", fg: "#107a3b" },
};

export function Pill({ label, tone = "info" }: PillProps) {
  const { bg, fg } = palette[tone];
  return (
    <span
      style={{
        display: "inline-block",
        background: bg,
        color: fg,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </span>
  );
}
