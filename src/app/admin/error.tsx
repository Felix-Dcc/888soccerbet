"use client";
import { useEffect } from "react";
import Link from "next/link";

/** Console error boundary: keeps the rail and offers a retry. (No kit import: the kit pulls in server-only analytics.) */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error("[admin]", error), [error]);
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-md border border-[#FF5A5F]/30 bg-[#10151C] px-6 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-[#FF5A5F]/10 font-bold text-[#FF8A8D]">!</span>
      <p className="font-semibold text-white">This page didn&apos;t load</p>
      <div className="flex gap-2">
        <button onClick={reset} className="inline-flex h-9 items-center rounded-md bg-lime px-3.5 text-sm font-bold text-lime-ink hover:bg-lime-600">
          Try again
        </button>
        <Link href="/admin" className="inline-flex h-9 items-center rounded-md border border-white/[0.09] px-3 text-sm font-semibold text-white hover:bg-white/[0.05]">
          Console home
        </Link>
      </div>
      {error.digest && <code className="text-[11px] text-fog">Ref {error.digest}</code>}
    </div>
  );
}
