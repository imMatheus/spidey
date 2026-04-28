type ColorBoxProps = {
  variant: "blue" | "red" | "green";
  text?: string;
};

const palette: Record<ColorBoxProps["variant"], string> = {
  blue: "#3b82f6",
  red: "#ef4444",
  green: "#22c55e",
};

export function ColorBox({ variant, text = "this is color box" }: ColorBoxProps) {
  return (
    <div
      style={{
        width: 100,
        height: 100,
        background: palette[variant],
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 600,
        padding: 4,
        boxSizing: "border-box",
      }}
    >
      {text}
    </div>
  );
}
