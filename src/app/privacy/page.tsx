import Link from "next/link";

export const metadata = { title: "Privacy" };

/** Set PRIVACY_CONTACT_EMAIL in the environment (see .env.example); it is read when the site is built. */
const CONTACT = process.env.PRIVACY_CONTACT_EMAIL?.trim();
const ANALYTICS = !!process.env.NEXT_PUBLIC_POSTHOG_KEY;

const SECTIONS: [string, string[]][] = [
  ["Playing as a guest", ["Your progress, reviews, and settings are stored only in your browser (IndexedDB). Nothing about your play is sent to a server, and nothing is gated behind an account.", "Clearing your browser data, or Settings → Reset progress, deletes it."]],
  [
    "If you sign in",
    [
      "We store four things: your email address, your display name if Google shares one, your progress (which levels you finished, with a score and attempt count for each), and a copy of your game save so your progress and review schedule follow you across devices.",
      "We use them to sync your progress, show your own progress back to you, and give signed-in players a larger daily allowance from the AI coach. The admin of this site can see the list of accounts with their email, sign-up date, last active date and progress.",
      "Sign-in is handled by Supabase (database and authentication). Google sign-in shares your email and name with us; the emailed link or code needs only your email. There are no passwords. The only cookie is the sign-in session.",
    ],
  ],
  [
    "Usage statistics",
    ANALYTICS
      ? [
          "To see where people get stuck, we count anonymous events: that a screen was opened, a level was started or finished, the briefing was skipped. We use PostHog for this. It sets no cookies, keeps its random id only in memory until you close the page, builds no profile of you, and never records what you type.",
          "You can switch this off in Settings → Privacy, and it stays off if your browser sends Do Not Track.",
        ]
      : ["This build does not collect usage statistics."],
  ],
  [
    "The AI coach",
    [
      "When you submit an explanation for grading or ask for a hint, that text and the question's context are sent to Groq to run the model. Don't include personal information in your answers.",
      "To keep the coach fair and affordable we count calls per person per day. For guests that count is keyed to a one-way hash of your network address and browser; the address itself isn't stored.",
      "You can switch the AI coach off in Settings; everything still works with self-grading.",
    ],
  ],
  [
    "Your own API key",
    [
      "If you add your own Groq or Claude API key in Settings, it is stored only in your browser (localStorage). We do not collect it: your browser sends requests directly to Groq or Anthropic, so the key never reaches our servers. It is not part of your synced save, your export file, or the usage statistics.",
      "What you submit for grading or hints goes to the provider you chose, under their terms, and is billed to your account. Remove the key in Settings at any time, and always on a shared computer.",
    ],
  ],
  ["Feedback", ["Feedback you send from Settings is stored with your email if you're signed in, and is read only by the people who run NINES."]],
  [
    "Deleting your data",
    ["Signed in: Settings → Delete my account and data removes your account, progress, synced save, AI usage and any feedback you sent while signed in, right away. The save in your browser stays until you reset it there.", "Guest: Settings → Reset progress, or clear your browser's site data."],
  ],
  ["What we don't do", ["No ads, no tracking cookies, no selling or sharing your data. We collect only what is listed on this page."]],
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 lg:px-8">
      <Link href="/" className="text-sm text-ink-2 hover:text-amber">
        ← HQ
      </Link>
      <h1 className="mt-6 font-display text-4xl font-semibold text-ink-0">Privacy</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-1">NINES is a learning game. It collects as little as it can and works fully without an account.</p>
      {SECTIONS.map(([title, paras]) => (
        <section key={title} className="mt-8">
          <h2 className="font-display text-xl font-semibold text-ink-0">{title}</h2>
          {paras.map((p) => (
            <p key={p} className="mt-2 text-[15px] leading-relaxed text-ink-1">
              {p}
            </p>
          ))}
        </section>
      ))}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold text-ink-0">Contact</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-1">
          {CONTACT ? (
            <>
              Questions or requests about your data:{" "}
              <a href={`mailto:${CONTACT}`} className="text-amber hover:text-amber-2">
                {CONTACT}
              </a>
              .
            </>
          ) : process.env.NODE_ENV === "production" ? (
            "Questions or requests about your data: use the feedback form in Settings."
          ) : (
            "Set PRIVACY_CONTACT_EMAIL in your environment to show a contact address here."
          )}
        </p>
      </section>
    </main>
  );
}
