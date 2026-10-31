"use client";
import { useEffect } from "react";
import Link from "next/link";

/** Console error boundary: keeps the rail and offers a retry. (No kit import: the kit pulls in server-only analytics.) */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error("[admin]", error), [error]);
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-danger/30 bg-ink-700 px-6 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-danger/10 font-bold text-danger">!</span>
      <p className="font-semibold text-white">This page didn&apos;t load</p>
      <div className="flex gap-2">
        <button onClick={reset} className="inline-flex h-9 items-center rounded-xl bg-lime px-3.5 text-sm font-bold text-lime-ink hover:bg-lime-600">
          Try again
        </button>
        <Link href="/admin" className="inline-flex h-9 items-center rounded-xl border border-line px-3 text-sm font-semibold text-white hover:bg-ink-500">
          Console home
        </Link>
      </div>
      {error.digest && <code className="text-[11px] text-fog">Ref {error.digest}</code>}
    </div>
  );
}
