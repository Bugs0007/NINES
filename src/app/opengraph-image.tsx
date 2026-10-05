import { ImageResponse } from "next/og";

export const alt = "NINES: learn system design and AI engineering by breaking simulated systems";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The link preview (LinkedIn, X, Slack): the Dusk palette, the pitch, and the nines scale. */
export default function OpenGraphImage() {
  const bars = [0.35, 0.55, 0.75, 1];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0f1519", color: "#e4dfd5", padding: 72, fontFamily: "Georgia, serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "68%" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#8fd4b2", fontFamily: "sans-serif", fontWeight: 600 }}>NINES</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 64, lineHeight: 1.05, fontWeight: 600 }}>Learn system design by breaking systems.</div>
            <div style={{ marginTop: 24, fontSize: 28, lineHeight: 1.35, color: "#c5c4bc", fontFamily: "sans-serif" }}>
              Predict, simulate, explain. Spaced reviews so it sticks. System design, AI engineering, and the fundamentals under both.
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#8f9790", fontFamily: "sans-serif" }}>Free · no sign-up · works on your phone</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", width: "32%", gap: 18 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ width: 44, height: 380 * h, borderRadius: 10, background: "#8fd4b2", opacity: 0.55 + i * 0.12 }} />
          ))}
          <div style={{ width: 44, height: 380 * 1.15, borderRadius: 10, border: "4px dashed #8fd4b2" }} />
        </div>
      </div>
    ),
    size,
  );
}
