"use client";
import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <div className="eyebrow text-sm text-alert">Incident</div>
        <h1 className="mt-2 font-display text-4xl font-semibold text-ink-0">Something on this page fell over</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-1">Your progress is safe in your browser. Try again, and if it keeps happening, send feedback from Settings.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={reset} className="inline-flex h-11 items-center rounded-sm bg-amber px-5 font-semibold text-bg-0 hover:bg-amber-2">
            Try again
          </button>
          <Link href="/" className="inline-flex h-11 items-center rounded-sm border border-line-2 px-5 font-semibold text-ink-0 hover:bg-bg-2">
            HQ
          </Link>
        </div>
      </div>
    </main>
  );
}
