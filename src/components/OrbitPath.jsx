export function OrbitPath({ r, cx = 0, cy = 0 }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="1.5"
      strokeDasharray="4 2"
    />
  );
}
