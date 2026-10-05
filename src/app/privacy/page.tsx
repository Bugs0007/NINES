import Link from "next/link";

export const metadata = { title: "Privacy" };

const SECTIONS: [string, string[]][] = [
  ["Playing as a guest", ["Your progress, reviews, and settings are stored only in your browser (IndexedDB). Nothing about your play is sent to a server.", "Clearing your browser data, or Settings → Reset progress, deletes it."]],
  [
    "If you sign in",
    [
      "We store your email address, your name as your sign-in provider shares it, and a copy of your progress so it follows you across devices.",
      "Settings → Delete account removes the account and its synced copy. The save in your browser stays until you reset it there.",
    ],
  ],
  [
    "The AI coach",
    [
      "When you submit an explanation for grading or ask for a hint, that text and the question's context are sent to Groq to run the model. Don't include personal information in your answers.",
      "To keep the coach fair and affordable we count calls per person per day. For guests that count is keyed to a one-way hash of your network address and browser; the address itself isn't stored.",
      "You can switch the AI coach off in Settings; everything still works with self-grading.",
    ],
  ],
  ["Feedback", ["Feedback you send from Settings is stored with your email if you're signed in, and is read only by the person who builds NINES."]],
  ["What we don't do", ["No ads, no tracking cookies, no selling or sharing your data. Sign-in uses a session cookie and nothing else."]],
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
    </main>
  );
}
