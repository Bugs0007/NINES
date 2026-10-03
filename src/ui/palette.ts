/**
 * The "Dusk" palette for code that paints directly (canvas, inline SVG attributes, charts). Mirrors the
 * tokens in src/app/globals.css; change both together.
 */
export const PALETTE = {
  bg0: "#0f1519",
  bg1: "#151d22",
  bg2: "#1b252b",
  bg3: "#233038",
  line: "#243139",
  line2: "#2f3f48",
  line3: "#42545e",
  ink0: "#e4dfd5",
  ink1: "#c5c4bc",
  ink2: "#8f9790",
  ink3: "#657069",
  phos: "#8fd4b2",
  phos2: "#6fbb98",
  phos3: "#3e7a62",
  phosDim: "#1c3830",
  amber: "#e8b77d",
  amber2: "#d29b62",
  amber3: "#8b6643",
  amberDim: "#382a1f",
  alert: "#ec8f80",
  alert2: "#d37466",
  alert3: "#82463d",
  alertDim: "#3a2320",
  sky: "#93bde3",
  sky3: "#3f6584",
  lilac: "#b9a7e8",
  lilac3: "#5d5089",
} as const;

/** `rgb(r g b / a)` for a palette hex, for translucent fills. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`;
}

type Face = "sans" | "mono" | "display";
const cache: Partial<Record<Face, string>> = {};

/**
 * A canvas `ctx.font` string using the app's self-hosted faces. next/font gives the families generated
 * names, exposed as CSS variables, so canvas code resolves them at runtime.
 */
export function canvasFont(face: Face, sizePx: number, weight = 500): string {
  if (!cache[face] && typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--font-${face}-face`).trim();
    const fallback = face === "mono" ? "ui-monospace, monospace" : face === "display" ? "Georgia, serif" : "system-ui, sans-serif";
    cache[face] = v ? `${v}, ${fallback}` : fallback;
  }
  return `${weight} ${sizePx}px ${cache[face] ?? "system-ui, sans-serif"}`;
}
