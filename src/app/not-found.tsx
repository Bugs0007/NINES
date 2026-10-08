import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <div className="eyebrow text-sm text-amber">404</div>
        <h1 className="mt-2 font-display text-4xl font-semibold text-ink-0">Nothing is deployed here</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-1">This route returned nothing, which is at least better than a 502.</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-sm bg-amber px-5 font-semibold text-bg-0 hover:bg-amber-2">
          Back to HQ
        </Link>
      </div>
    </main>
  );
}
