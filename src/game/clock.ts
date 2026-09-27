/**
 * Game clock. Playtest "time warp" shifts every FSRS computation forward so decay can be seen
 * without waiting days. Streaks always use the real clock.
 */
let offsetMs = 0;

export function setTimeWarp(days: number): void {
  offsetMs = Math.max(0, days) * 86_400_000;
}

export function timeWarpDays(): number {
  return offsetMs / 86_400_000;
}

export function gameNow(): Date {
  return new Date(Date.now() + offsetMs);
}
