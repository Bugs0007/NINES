"use client";
/**
 * Cross-device progress for signed-in players. The browser's IndexedDB stays the source of truth while
 * playing; this keeps a copy on the server.
 *
 * - First sign-in on this device: the save with more XP wins, so a fresh guest session never overwrites
 *   real progress (and real guest progress is kept when the account is new).
 * - After that: the newer save wins, and local changes upload a few seconds after they happen.
 */
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { exportAll, importAll, type ExportBlob } from "./db";
import { useGame } from "./store";

const SAVED_AT = "nines:savedAt";
const MAX_EVENTS = 1500;

function ls(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* storage blocked: sync still works, it just can't remember it linked */
  }
}

async function upload(): Promise<void> {
  const blob = await exportAll();
  const trimmed: ExportBlob = { ...blob, events: blob.events.slice(-MAX_EVENTS) };
  const savedAt = Date.now();
  const r = await fetch("/api/progress", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ blob: trimmed, savedAt }) });
  if (r.ok) lsSet(SAVED_AT, String(savedAt));
}

export function useProgressSync(): void {
  const { data, status } = useSession();
  const hydrated = useGame((s) => s.hydrated);
  const uid = data?.user?.id;

  useEffect(() => {
    if (status !== "authenticated" || !uid || !hydrated) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => void) | null = null;
    const linkKey = `nines:linked:${uid}`;

    (async () => {
      try {
        const r = await fetch("/api/progress", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { progress: { blob: ExportBlob; savedAt: number } | null };
        const server = j.progress;
        const local = await exportAll();
        const linked = ls(linkKey) === "1";
        const localSavedAt = Number(ls(SAVED_AT) ?? 0);
        const useServer = !!server && (linked ? server.savedAt > localSavedAt : (server.blob.profile?.xp ?? 0) > (local.profile?.xp ?? 0));
        lsSet(linkKey, "1");
        if (cancelled) return;
        if (useServer && server) {
          await importAll(server.blob);
          lsSet(SAVED_AT, String(server.savedAt));
          window.location.reload();
          return;
        }
        if (!server || server.savedAt < localSavedAt || !linked) await upload();
      } catch {
        return;
      }
      if (cancelled) return;
      unsub = useGame.subscribe((s, prev) => {
        if (s.profile === prev.profile && s.concepts === prev.concepts) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void upload().catch(() => undefined), 4000);
      });
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsub?.();
    };
  }, [status, uid, hydrated]);
}
