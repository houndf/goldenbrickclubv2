import ui from "./ui.module.css";

/**
 * Initials in a colored circle. Text is dark on every palette color except red.
 * Oracle winners (tournament champions) get a small 🔮 badge.
 */
export function Avatar({
  initials,
  color = "#3DD6C4",
  size = 44,
  oracle = 0,
}: {
  initials: string;
  color?: string;
  size?: number;
  /** Number of tournament Oracle trophies won. */
  oracle?: number;
}) {
  const darkBg = color.toLowerCase() === "#d7263d";
  const badge = Math.max(16, Math.round(size * 0.5));
  // Sizes are given in reference pixels and drawn in rem, so avatars scale with the app.
  const r = (px: number) => `${px / 16}rem`;
  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <span
        className={ui.avatar}
        aria-hidden="true"
        style={{
          width: r(size),
          height: r(size),
          fontSize: r(Math.round(size * 0.38)),
          background: color,
          color: darkBg ? "var(--cream)" : "var(--ink)",
          borderWidth: size < 32 ? 2 : 3,
        }}
      >
        {initials}
      </span>
      {oracle > 0 && (
        <span
          title={oracle === 1 ? "Oracle trophy winner" : `${oracle}× Oracle trophy winner`}
          style={{
            position: "absolute",
            right: r(-badge * 0.35),
            bottom: r(-badge * 0.3),
            width: r(badge),
            height: r(badge),
            borderRadius: "50%",
            background: "var(--purple)",
            border: "2px solid var(--ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: r(badge * 0.6),
            lineHeight: 1,
          }}
        >
          <span aria-hidden="true">🔮</span>
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Oracle winner
          </span>
        </span>
      )}
    </span>
  );
}
