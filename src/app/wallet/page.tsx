import { SignedOut } from "@/components/SignedOut";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { userCashBalance } from "@/lib/ledger";
import { formatPesewas } from "@/lib/money";
import { WalletCard } from "@/components/WalletCard";
import { WalletPanel } from "@/components/WalletPanel";
import { minDeposit, reconcilePendingDeposits, verificationState } from "@/lib/wallet";
import { getPlatformSettings } from "@/lib/platformSettings";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) return <SignedOut title="Wallet" />;
  // Settle any deposit whose webhook never came, before showing the balance. Never blocks the page.
  await reconcilePendingDeposits(user.id).catch((e) => console.error("[wallet] reconcile failed:", e instanceof Error ? e.message : e));

  const [balance, intents, verification] = await Promise.all([
    userCashBalance(prisma, user.id),
    prisma.paymentIntent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    verificationState(user.id),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="section-title text-2xl">Wallet</h1>

      {/* The card sits on top of the deposit form it funds; transactions run alongside. */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <WalletCard balance={balance} holder={user.displayName ?? user.email.split("@")[0] ?? user.email} phone={user.phone} since={user.createdAt} />
          <WalletPanel
          minDepositGhs={Number(await minDeposit()) / 100}
          minWithdrawalGhs={(await getPlatformSettings()).minWithdrawalGhs}
          isAdmin={user.role !== "USER"}
          verification={{
            required: verification.required,
            stage: verification.stage,
            kyc: verification.kyc,
            ntt: verification.ntt,
            status: verification.status,
          }}
          />
        </div>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-white">Transactions</h2>
          {intents.length === 0 ? (
            <p className="text-sm text-fog-muted">None yet</p>
          ) : (
            <ul className="divide-y divide-line">
              {intents.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-semibold text-white">
                      {i.direction === "DEPOSIT" ? "Deposit" : "Withdrawal"}{" "}
                      <span className="font-mono text-xs text-fog-muted">{i.ref}</span>
                    </div>
                    <div className="text-xs text-fog-muted">{new Date(i.createdAt).toLocaleString("en-GB")}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold tabular-nums ${i.direction === "DEPOSIT" ? "text-win" : "text-fog"}`}>
                      {i.direction === "DEPOSIT" ? "+" : "−"}GHS {formatPesewas(i.amount)}
                    </div>
                    <StatusTag status={i.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "text-warn",
    SUCCEEDED: "text-win",
    FAILED: "text-danger",
    CANCELLED: "text-fog-muted",
  };
  return <span className={`text-xs ${map[status] ?? "text-fog-muted"}`}>{status}</span>;
}
