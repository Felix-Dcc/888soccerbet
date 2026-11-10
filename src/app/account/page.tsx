import Link from "next/link";
import { SignedOut } from "@/components/SignedOut";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { userCashBalance } from "@/lib/ledger";
import { formatPesewas } from "@/lib/money";
import { monthYear } from "@/lib/time";
import { LogoutButton, ResponsibleGamblingForm } from "@/components/AccountPanel";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

/**
 * My Account: a brand profile banner (who, balance, the main actions), the bet record at a glance,
 * then details + appearance on one side and the responsible-gambling limits on the other.
 */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) return <SignedOut title="Account" />;

  const [balance, byStatus] = await Promise.all([
    userCashBalance(prisma, user.id),
    prisma.bet.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const total = byStatus.reduce((n, b) => n + b._count._all, 0);

  const name = user.displayName ?? user.email.split("@")[0] ?? user.email;
  const verified = !!user.emailVerifiedAt;
  const excluded = user.selfExcludedUntil && user.selfExcludedUntil > new Date() ? user.selfExcludedUntil : null;

  return (
    <div className="space-y-5">
      {/* Profile banner: stays on the dark brand body in both themes, like the header. */}
      <section className="theme-dark relative isolate overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,#17202E_0%,#040913_58%,#0C1421_100%)] p-5 shadow-lift sm:p-7">
        <svg aria-hidden className="absolute inset-0 -z-10 h-full w-full" viewBox="0 0 800 220" preserveAspectRatio="none">
          <path d="M260 220 Q520 70 820 30 Q560 120 360 220 Z" fill="#00BA3B" opacity=".12" />
        </svg>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span
              aria-hidden
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-ink-500 font-display text-2xl font-extrabold uppercase text-lime ring-2 ring-lime/60 sm:h-[72px] sm:w-[72px]"
            >
              {initials(name)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{name}</h1>
              <p className="truncate text-sm text-fog">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
                <Pill tone={user.status === "ACTIVE" ? "ok" : "warn"}>{titleCase(user.status)}</Pill>
                {verified ? (
                  <Pill tone="ok">Email verified</Pill>
                ) : (
                  <Link href="/verify-email" className="rounded-full bg-gold/15 px-2.5 py-0.5 text-gold hover:bg-gold/25">
                    Verify email →
                  </Link>
                )}
                <Pill tone="muted">Member since {monthYear(user.createdAt)}</Pill>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
            <div className="mr-auto sm:mr-3 sm:text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fog-muted">Balance</div>
              <div className="font-display text-2xl font-extrabold tabular-nums text-gold sm:text-3xl">
                <span className="mr-1 text-sm font-bold text-gold/80">GHS</span>
                {formatPesewas(balance)}
              </div>
            </div>
            <Link href="/wallet" className="btn-lime px-5 py-2.5 text-sm">
              Deposit
            </Link>
            <LogoutButton />
          </div>
        </div>
      </section>

      {/* The bet record at a glance; each tile opens that view of My Bets. */}
      <div className="grid grid-cols-3 gap-3">
        <Stat href="/bets?tab=unsettled" label="Open bets" value={count("PENDING")} />
        <Stat href="/bets?tab=settled" label="Bets won" value={count("WON")} accent />
        <Stat href="/bets" label="All bets" value={total} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <Heading title="Personal details" />
            <dl className="divide-y divide-line">
              <Row label="Name" value={user.displayName ?? "—"} />
              <Row label="Email" value={user.email} />
              <Row label="Mobile" value={user.phone ?? "—"} />
              <Row label="Country" value={user.country === "GH" ? "Ghana" : user.country} />
              <Row label="Self-exclusion" value={excluded ? `Until ${excluded.toLocaleDateString("en-GB")}` : "None"} />
            </dl>
          </section>

          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-white">Appearance</h2>
                <p className="mt-0.5 text-sm text-fog-muted">Dark or white background. Saved on this device.</p>
              </div>
              <ThemeToggle />
            </div>
          </section>

          <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h2 className="font-semibold text-white">Need help?</h2>
              <p className="mt-0.5 text-sm text-fog-muted">Our support team answers by email.</p>
            </div>
            <a href="mailto:support@betzone.com.co" className="btn-ghost px-4 py-2 text-sm">
              Contact support
            </a>
          </section>
        </div>

        <section className="card overflow-hidden">
          <Heading title="Responsible gambling" note="Set deposit and stake limits that suit you, or take a break."/>
          <div className="p-5">
            <ResponsibleGamblingForm
              initial={{
                daily: user.dailyDepositLimit ? formatPesewas(user.dailyDepositLimit) : null,
                maxStake: user.maxStakeLimit ? formatPesewas(user.maxStakeLimit) : null,
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const initials = (n: string) =>
  n
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("") || "?";

function Pill({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "bg-teal/15 text-teal" : tone === "warn" ? "bg-gold/15 text-gold" : "bg-white/[0.07] text-fog";
  return <span className={`rounded-full px-2.5 py-0.5 ${cls}`}>{children}</span>;
}

function Stat({ href, label, value, accent = false }: { href: string; label: string; value: number; accent?: boolean }) {
  return (
    <Link href={href} className="card group p-4 transition-colors hover:border-ink-400">
      <div className="text-xs font-medium text-fog-muted">{label}</div>
      <div className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${accent ? "text-teal" : "text-white"}`}>{value}</div>
    </Link>
  );
}

function Heading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="border-b border-line px-5 py-4">
      <h2 className="font-semibold text-white">{title}</h2>
      {note && <p className="mt-0.5 text-sm text-fog-muted">{note}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-sm text-fog-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}
