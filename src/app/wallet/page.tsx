import { SignedOut } from "@/components/SignedOut";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { userCashBalance } from "@/lib/ledger";
import { formatPesewas } from "@/lib/money";
import { WalletPanel } from "@/components/WalletPanel";
import { minDeposit, reconcilePendingDeposits, verificationState } from "@/lib/wallet";
import { PageHero } from "@/components/PageHero";
import { photos } from "@/lib/photos";

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
    <div className="space-y-6">
      <PageHero title="Wallet" photo={photos.footballStadiumBlue} position="center 60%">
        <span aria-label="Balance" className="ml-auto rounded-xl bg-black/50 px-4 py-2 font-display text-2xl font-extrabold tabular-nums text-lime backdrop-blur sm:text-3xl">
          GHS {formatPesewas(balance)}
        </span>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-2">
        <WalletPanel
          minDepositGhs={Number(minDeposit()) / 100}
          verification={{
            required: verification.required,
            paid: verification.paid,
            needed: verification.needed,
            perPaymentGhs: Number(verification.perPayment) / 100,
            heldGhs: Number(verification.held) / 100,
            status: verification.status,
          }}
        />

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
