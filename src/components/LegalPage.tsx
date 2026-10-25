import Link from "next/link";
import { TERMS_VERSION } from "@/lib/legal";

const PAGES = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/cookies", label: "Cookies Policy" },
  { href: "/refunds", label: "Refund Policy" },
];

const effective = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(TERMS_VERSION));

/** Shared layout for the legal pages: readable prose, effective date, links between them. */
export function LegalPage({ title, path, children }: { title: string; path: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <nav aria-label="Legal" className="flex flex-wrap gap-2">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} aria-current={p.href === path ? "page" : undefined} className={`chip ${p.href === path ? "chip-active" : ""}`}>
            {p.label}
          </Link>
        ))}
      </nav>
      <article className="card p-5 sm:p-8 [&_a]:font-semibold [&_a]:text-lime [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:text-white [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h1>
        <p className="!mt-1 text-sm text-fog">Effective {effective}</p>
        <div className="text-[15px] leading-relaxed text-fog">{children}</div>
      </article>
    </div>
  );
}

/** A two-column table that scrolls sideways on narrow phones instead of squashing. */
export function LegalTable({ head, rows }: { head: [string, string, string?]; rows: [string, string, string?][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="bg-ink-600 text-white">
          <tr>
            {head.filter(Boolean).map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.filter((c) => c !== undefined).map((c, i) => (
                <td key={i} className={`px-3 py-2 align-top ${i === 0 ? "font-semibold text-white" : "text-fog"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
