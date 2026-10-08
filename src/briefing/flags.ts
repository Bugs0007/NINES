/**
 * Automation switch for first-visit overlays (the briefing and the guided tour). The e2e suite sets
 * localStorage["nines:onboarding"] = "off" in its storage state, exactly like the AI coach switch, so tests of
 * other screens are not covered by a first-visit overlay. Players never see this.
 */
export function onboardingOff(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("nines:onboarding") === "off";
  } catch {
    return false;
  }
}
