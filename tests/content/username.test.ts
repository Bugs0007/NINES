import { describe, expect, it } from "vitest";
import { normalizeUsername, suggestUsername, usernameProblem, USERNAME_RE } from "@/account/username";
import { withMergedSeen } from "@/game/merge";
import { freshProfile, type ExportBlob } from "@/game/db";

describe("usernames", () => {
  it("accepts ordinary handles and normalises case and a leading @", () => {
    for (const ok of ["pigeon_dev", "Pigeon_Dev", "@asha99", "a_b", "ravi_k_2026", "x".repeat(20)]) expect(usernameProblem(ok), ok).toBeNull();
    expect(normalizeUsername("  @Pigeon_Dev ")).toBe("pigeon_dev");
  });

  it("explains what is wrong in plain language", () => {
    expect(usernameProblem("")).toMatch(/Pick/);
    expect(usernameProblem("ab")).toMatch(/at least 3/);
    expect(usernameProblem("x".repeat(21))).toMatch(/at most 20/);
    expect(usernameProblem("has space")).toMatch(/letters, numbers and underscores/);
    expect(usernameProblem("naïve")).toMatch(/letters, numbers and underscores/);
    expect(usernameProblem("a-b-c")).toMatch(/letters, numbers and underscores/);
    expect(usernameProblem("12345")).toMatch(/letters/);
    expect(usernameProblem("____")).toMatch(/letters/);
    expect(usernameProblem("admin")).toMatch(/reserved/);
    expect(usernameProblem("Nines")).toMatch(/reserved/);
  });

  it("the database format check and the app agree", () => {
    for (const s of ["abc", "a1_", "z".repeat(20)]) expect(USERNAME_RE.test(s)).toBe(true);
    for (const s of ["ab", "A_B", "a b", "z".repeat(21), "é_é"]) expect(USERNAME_RE.test(s)).toBe(false);
  });

  it("suggests a valid name from an email or a display name", () => {
    for (const [email, name] of [["asha.rao@example.com", null], [null, "Ravi Kumar"], ["a@b.co", null], [null, null], ["12345@x.io", null], ["admin@x.io", null], ["very.long.address.indeed.more.than.twenty@x.io", null]] as const) {
      const s = suggestUsername(email, name);
      expect(usernameProblem(s), `${email}/${name} -> ${s}`).toBeNull();
    }
    expect(suggestUsername("asha.rao@example.com", null)).toBe("asha_rao");
  });
});

describe("replacing a save with the server's copy keeps what was already seen", () => {
  const blob = (seen: string[]): ExportBlob => ({ version: 1, exportedAt: 1, profile: { ...freshProfile(1), seen }, concepts: [], events: [], designs: [] });
  it("unions the seen lists so a first-visit overlay never replays", () => {
    const merged = withMergedSeen(blob(["briefing:v1"]), { seen: ["briefing:v1", "tour:hq:v1", "signin-start:v1"] });
    expect(new Set(merged.profile.seen)).toEqual(new Set(["briefing:v1", "tour:hq:v1", "signin-start:v1"]));
  });
  it("leaves everything else from the server copy alone, and tolerates a missing local profile", () => {
    const server = blob(["a"]);
    server.profile.xp = 777;
    const merged = withMergedSeen(server, undefined);
    expect(merged.profile.xp).toBe(777);
    expect(merged.profile.seen).toEqual(["a"]);
  });
});
