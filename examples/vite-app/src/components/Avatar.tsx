type AvatarProps = {
  name: string;
  src?: string;
  size?: number;
};

export function Avatar({ name, src, size = 56 }: AvatarProps) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "linear-gradient(135deg, #6e8efb, #a777e3)",
        display: "grid",
        placeItems: "center",
        color: "white",
        fontSize: size * 0.42,
        fontWeight: 700,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initial
      )}
    </div>
  );
}
