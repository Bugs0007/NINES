"use client";
/**
 * Opens the sign-in dialog from anywhere ("Save progress" in the header, the prompt after the first level).
 * The dialog itself is src/account/SignInDialog.tsx, mounted once in the app shell.
 */
import { create } from "zustand";

export type SignInReason = "manual" | "first-level" | "start";

interface SignInUi {
  open: boolean;
  reason: SignInReason;
  show: (reason?: SignInReason) => void;
  hide: () => void;
}

export const useSignInUi = create<SignInUi>()((set) => ({
  open: false,
  reason: "manual",
  show: (reason = "manual") => set({ open: true, reason }),
  hide: () => set({ open: false }),
}));

/** The username dialog: opens itself after sign-in until a name is chosen, and from Settings to change it. */
interface UsernameUi {
  open: boolean;
  show: () => void;
  hide: () => void;
}
export const useUsernameUi = create<UsernameUi>()((set) => ({ open: false, show: () => set({ open: true }), hide: () => set({ open: false }) }));
