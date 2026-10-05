"use client";
/**
 * The player's account as the browser sees it: signed out (guest), a player, or the owner. Guests play
 * fully; signing in only adds cross-device progress and a larger AI allowance.
 */
import { useSession } from "next-auth/react";
import type { Edition } from "@/content/edition";

export type Role = "guest" | "player" | "owner";

export function useAccount(): { status: "loading" | "guest" | "signed-in"; id: string | null; email: string | null; name: string | null; role: Role } {
  const { data, status } = useSession();
  if (status === "loading") return { status: "loading", id: null, email: null, name: null, role: "guest" };
  if (!data?.user) return { status: "guest", id: null, email: null, name: null, role: "guest" };
  const role = ((data.user as { role?: Role }).role ?? "player") as Role;
  return { status: "signed-in", id: data.user.id ?? null, email: data.user.email ?? null, name: data.user.name ?? null, role };
}

export function useEdition(): Edition {
  return useAccount().role === "owner" ? "owner" : "public";
}
