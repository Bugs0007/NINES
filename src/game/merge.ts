/**
 * When a signed-in player's save is replaced by the server's copy (a new device, or a newer save), things that only
 * ever go one way must survive: a first-visit overlay already seen on this device must not play again because the
 * server's older copy predates it. Pure, so it is tested.
 */
import type { ExportBlob, Profile } from "./db";

export function withMergedSeen(server: ExportBlob, local: Pick<Profile, "seen"> | undefined): ExportBlob {
  const seen = [...new Set([...(server.profile?.seen ?? []), ...(local?.seen ?? [])])];
  return { ...server, profile: { ...server.profile, seen } };
}
