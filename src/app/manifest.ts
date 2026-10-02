import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NINES",
    short_name: "NINES",
    description: "A game about keeping systems up: system design, AI engineering, and the fundamentals under both.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#04070a",
    theme_color: "#04070a",
    categories: ["education", "games"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Daily shift", url: "/shift" },
      { name: "Codex", url: "/codex" },
    ],
  };
}
