import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { currentUser } from "@/auth";

/** Dev tools (seed, widget sandbox, intro preview, perf): open locally and in tests, admin-only in production. */
export default async function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.NINES_DEV_LOGIN !== "1") {
    const u = await currentUser();
    if (u?.role !== "admin") notFound();
  }
  return children;
}
