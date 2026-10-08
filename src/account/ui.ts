"use client";
/**
 * Opens the sign-in dialog from anywhere ("Save progress" in the header, the prompt after the first level).
 * The dialog itself is src/account/SignInDialog.tsx, mounted once in the app shell.
 */
import { create } from "zustand";

export type SignInReason = "manual" | "first-level";

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
