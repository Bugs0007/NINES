"use client";
/**
 * Cross-device progress for signed-in players. The browser's IndexedDB stays the source of truth while
 * playing; this keeps a copy on the server.
 *
 * - First sign-in on this device: the save with more XP wins, so a fresh guest session never overwrites
 *   real progress (and real guest progress is kept when the account is new).
 * - After that: the newer save wins, and local changes upload a few seconds after they happen.
 */
import { useEffect } from "react";
import { track } from "@/analytics/track";
import { MAX_ROWS_PER_WRITE } from "@/content/progress-model";
import { useAccount } from "./account";
import { exportAll, importAll, type ExportBlob } from "./db";
import { withMergedSeen } from "./merge";
import { deriveRows } from "./progress-rows";
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

/** Send the save and the progress rows. The server validates the rows and stores the ones that make sense. */
async function upload(): Promise<void> {
  const blob = await exportAll();
  const trimmed: ExportBlob = { ...blob, events: blob.events.slice(-MAX_EVENTS) };
  const rows = deriveRows(blob.concepts, blob.profile, blob.events).slice(0, MAX_ROWS_PER_WRITE);
  const savedAt = Date.now();
  const r = await fetch("/api/progress", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ blob: trimmed, savedAt, rows }) });
  if (r.ok) lsSet(SAVED_AT, String(savedAt));
}

export function useProgressSync(): void {
  const acct = useAccount();
  const hydrated = useGame((s) => s.hydrated);
  const status = acct.status;
  const uid = acct.id;

  useEffect(() => {
    if (status !== "signed-in" || !uid || !hydrated) return;
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
          await importAll(withMergedSeen(server.blob, local.profile));
          lsSet(SAVED_AT, String(server.savedAt));
          window.location.reload();
          return;
        }
        if (!server && !linked) track("signed_up");
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
