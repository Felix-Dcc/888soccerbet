"use client";
import { useEffect } from "react";
import Link from "next/link";

/** Route-level error boundary: keeps the shell (nav, betslip) and offers a retry. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error("[page]", error), [error]);
  return (
    <div role="alert" className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-danger/10 text-2xl text-danger">!</span>
      <div className="font-display text-lg font-bold text-white">Couldn&apos;t load this page</div>
      <div className="flex gap-2">
        <button onClick={reset} className="btn-lime px-4 py-2 text-sm">
          Try again
        </button>
        <Link href="/" className="btn-ghost px-4 py-2 text-sm">
          Home
        </Link>
      </div>
      {error.digest && <code className="text-[11px] text-fog-muted">Ref {error.digest}</code>}
    </div>
  );
}
