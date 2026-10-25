import Link from "next/link";

/** Shown by member-only pages to signed-out visitors: the page title plus the one action that unlocks it. */
export function SignedOut({ title }: { title: string }) {
  return (
    <div className="card flex flex-col items-center gap-4 p-10">
      <h1 className="font-display text-xl font-bold text-white">{title}</h1>
      <Link href="/login" className="btn-lime px-5 py-2.5">
        Log in
      </Link>
    </div>
  );
}
