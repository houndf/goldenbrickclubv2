const fills = {
  gold: "#F5C230",
  silver: "#C7CCD6",
};

export function BrickLogo({
  size = 40,
  tilt = 0,
  tone = "gold",
}: {
  size?: number;
  tilt?: number;
  tone?: keyof typeof fills;
}) {
  return (
    <svg
      width={size}
      height={(size * 30) / 40}
      viewBox="0 0 40 30"
      aria-hidden="true"
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
    >
      <rect x="2" y="2" width="36" height="26" rx="5" fill={fills[tone]} stroke="#0B0810" strokeWidth="2.5" />
      <path
        d="M2 15 H38 M20 2 V15 M11 15 V28 M29 15 V28"
        stroke="#0B0810"
        strokeWidth="2.5"
        fill="none"
      />
    </svg>
  );
}
