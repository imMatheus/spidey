type ButtonProps = {
  label: string;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  onClick?: () => void;
};

const styles: Record<string, React.CSSProperties> = {
  primary: { background: "#0d1f3c", color: "white" },
  ghost: { background: "transparent", color: "#0d1f3c", border: "1px solid #0d1f3c" },
  danger: { background: "#d23a3a", color: "white" },
};

export function Button({
  label,
  variant = "primary",
  disabled,
  onClick,
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 18px",
        borderRadius: 6,
        border: "none",
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...styles[variant],
      }}
    >
      {label}
    </button>
  );
}
