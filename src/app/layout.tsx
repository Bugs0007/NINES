import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Big_Shoulders_Stencil, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Shell } from "@/ui/Shell";
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-display-face",
  display: "swap",
});

const stencil = Big_Shoulders_Stencil({
  subsets: ["latin"],
  weight: "800",
  variable: "--font-stencil-face",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans-face",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
