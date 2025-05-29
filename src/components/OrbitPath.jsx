export function OrbitPath({ r, cx = 0, cy = 0 }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke="#6b7280"
      strokeWidth="1.5"
      strokeDasharray="4 2"
    />
  );
}
