/** "02:14:07" for a sim time, given clock0 = "02:12:00". */
export function clockAt(t: number, clock0 = "02:12:00"): string {
  const [h, m, s] = clock0.split(":").map(Number) as [number, number, number];
  let total = h * 3600 + m * 60 + s + Math.floor(t);
  total = ((total % 86400) + 86400) % 86400;
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
