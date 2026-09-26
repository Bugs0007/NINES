import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Shell } from "@/ui/Shell";
import "./globals.css";

// Self-hosted (OFL) so builds and the PWA work offline. See DECISIONS D-011.
const display = localFont({
  src: [
    { path: "../fonts/big-shoulders-display-latin-700-normal.woff2", weight: "700" },
    { path: "../fonts/big-shoulders-display-latin-800-normal.woff2", weight: "800" },
    { path: "../fonts/big-shoulders-display-latin-900-normal.woff2", weight: "900" },
  ],
  variable: "--font-display-face",
  display: "swap",
});

const stencil = localFont({
  src: [{ path: "../fonts/big-shoulders-stencil-display-latin-800-normal.woff2", weight: "800" }],
  variable: "--font-stencil-face",
  display: "swap",
});

const sans = localFont({
  src: [
    { path: "../fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-sans-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-sans-face",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "NINES", template: "%s · NINES" },
  description: "A game about keeping systems up: system design, AI engineering, and the fundamentals under both.",
  applicationName: "NINES",
  appleWebApp: { capable: true, title: "NINES", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#04070a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${stencil.variable} ${sans.variable} ${mono.variable}`} data-reduced-motion="system">
      <body className="crt">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
