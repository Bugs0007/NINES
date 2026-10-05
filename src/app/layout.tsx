import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Shell } from "@/ui/Shell";
import "./globals.css";

// Self-hosted (OFL) so builds and the PWA work offline. See DECISIONS D-011 and D-018.
// Fraunces (variable: opsz, wght, SOFT, WONK) for headings and big readouts; Figtree for the interface.
const display = localFont({
  src: [
    { path: "../fonts/fraunces-latin-full-normal.woff2", weight: "300 900", style: "normal" },
    { path: "../fonts/fraunces-latin-full-italic.woff2", weight: "300 900", style: "italic" },
  ],
  variable: "--font-display-face",
  display: "swap",
});

const sans = localFont({
  src: [
    { path: "../fonts/figtree-latin-wght-normal.woff2", weight: "300 900", style: "normal" },
    { path: "../fonts/figtree-latin-wght-italic.woff2", weight: "300 900", style: "italic" },
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

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3100");
const DESCRIPTION = "Learn system design, AI engineering, and backend fundamentals by predicting, breaking, and explaining live simulated systems. Spaced reviews keep it from fading. Free, no sign-up.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "NINES: learn system design by breaking systems", template: "%s · NINES" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "NINES", title: "NINES: learn system design by breaking systems", description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: "NINES: learn system design by breaking systems", description: DESCRIPTION },
  applicationName: "NINES",
  appleWebApp: { capable: true, title: "NINES", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0f1519",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} data-reduced-motion="system">
      <body className="dusk">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
