import { SignedOut } from "@/components/SignedOut";
import { getCurrentUser } from "@/lib/session";
import { formatPesewas } from "@/lib/money";
import { LogoutButton, ResponsibleGamblingForm } from "@/components/AccountPanel";
import { PageHero } from "@/components/PageHero";
import { photos } from "@/lib/photos";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) return <SignedOut title="Account" />;

  return (
    <div className="space-y-6">
      <PageHero title="Account" photo={photos.basketballCourtNight} position="center 70%">
        <span className="ml-auto flex gap-2">
          <a href="mailto:support@kingsbet.gh" className="btn border border-white/20 bg-black/40 px-4 py-2 text-sm text-white backdrop-blur hover:bg-black/60">
            Support
          </a>
          <LogoutButton />
        </span>
      </PageHero>

      <section className="card p-6">
        <h2 className="mb-4 font-semibold text-white">Profile</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="Name" value={user.displayName ?? "—"} />
          <Row label="Email" value={user.email} />
          <Row label="Mobile" value={user.phone ?? "—"} />
          <Row label="Status" value={titleCase(user.status)} />
          <Row label="Country" value={user.country} />
          <Row label="Self-exclusion" value={user.selfExcludedUntil ? `Until ${user.selfExcludedUntil.toLocaleDateString("en-GB")}` : "None"} />
        </dl>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 font-semibold text-white">Limits</h2>
        <ResponsibleGamblingForm
          initial={{
            daily: user.dailyDepositLimit ? formatPesewas(user.dailyDepositLimit) : null,
            maxStake: user.maxStakeLimit ? formatPesewas(user.maxStakeLimit) : null,
          }}
        />
      </section>
    </div>
  );
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-800 p-3">
      <dt className="text-xs uppercase tracking-wide text-fog-muted">{label}</dt>
      <dd className="font-semibold text-white">{value}</dd>
    </div>
  );
}
