import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="font-display text-5xl font-extrabold text-lime">404</span>
      <div className="font-display text-lg font-bold text-white">This page or match doesn&apos;t exist</div>
      <Link href="/" className="btn-lime px-4 py-2 text-sm">
        Back to matches
      </Link>
    </div>
  );
}
