import { Logo } from "./Logo";
import { amountIn, GHS_CURRENCY, unitOf, type Currency } from "@/lib/currency";
import { monthYear } from "@/lib/time";

/**
 * The wallet balance as a payment card: chip, contactless mark, balance in gold, cardholder and
 * member-since date. Everything printed on it is the player's real data. It is a branded wallet
 * card, deliberately not a card network's — deposits here are mobile money, not a card scheme.
 *
 * A card is a physical object, so this is the one surface allowed depth: a gradient body, the
 * logo's speed swoosh in the background, and a sheen that sweeps across on hover.
 */
export function WalletCard({ balance, holder, phone, since, currency = GHS_CURRENCY }: { balance: bigint; holder: string; phone: string | null; since: Date; currency?: Currency }) {
  const last4 = phone?.replace(/\D/g, "").slice(-4);
  return (
    <section
      aria-label="Wallet balance"
      className="group relative isolate flex aspect-[1.586/1] w-full flex-col justify-between overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-ink-600 via-ink-800 to-ink-600 p-5 text-white shadow-lift transition-transform duration-300 ease-out hover:-translate-y-1 sm:p-6"
    >
      {/* the logo's speed swoosh, sweeping across the card */}
      <svg aria-hidden className="absolute inset-0 -z-10 h-full w-full" viewBox="0 0 400 252" preserveAspectRatio="none">
        <path d="M-20 214 Q170 104 430 52 Q196 132 -20 240 Z" fill="#00BA3B" opacity=".16" />
        <path d="M-20 252 Q196 156 430 120 Q212 190 -20 262 Z" fill="#00BA3B" opacity=".08" />
      </svg>
      {/* a faint crown-gold warmth behind the logo */}
      <div aria-hidden className="absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(245,196,81,.16),transparent_65%)]" />
      {/* sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.09),transparent)] transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
      />

      <div className="flex items-start justify-between">
        <Chip />
        <Logo size="sm" />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Available balance</div>
          <div className="mt-1 truncate font-display text-[28px] font-extrabold leading-none tabular-nums text-gold sm:text-4xl">
            <span className="mr-1.5 text-base font-bold text-gold/80 sm:text-lg">{unitOf(currency)}</span>
            {amountIn(currency, balance)}
          </div>
        </div>
        <Contactless />
      </div>

      <div>
        {last4 && (
          // Tight groups with a gap between them, the way a card number is printed.
          <div className="mb-2.5 flex gap-3 font-mono text-sm tracking-[0.08em] text-white/80 sm:gap-4 sm:text-[15px]" aria-label={`Wallet number ending ${last4}`}>
            <span aria-hidden>••••</span>
            <span aria-hidden>••••</span>
            <span aria-hidden>••••</span>
            <span aria-hidden>{last4}</span>
          </div>
        )}
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/50">Cardholder</div>
            <div className="truncate text-sm font-semibold uppercase tracking-wider">{holder}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/50">Member since</div>
            <div className="font-mono text-sm font-semibold tracking-wider">{monthYear(since)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** EMV-style contact chip, in the crown's gold. */
function Chip() {
  return (
    <svg viewBox="0 0 48 36" className="h-8 w-11 drop-shadow-[0_1px_1px_rgba(0,0,0,.4)] sm:h-9 sm:w-12" aria-hidden>
      <defs>
        <linearGradient id="wc-chip" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE7A3" />
          <stop offset=".5" stopColor="#F5C451" />
          <stop offset="1" stopColor="#C8891A" />
        </linearGradient>
      </defs>
      <rect x=".75" y=".75" width="46.5" height="34.5" rx="6" fill="url(#wc-chip)" stroke="#A9700F" strokeWidth="1" />
      <path d="M1 12h13M1 24h13M34 12h13M34 24h13M14 1v34M34 1v34M14 18h20" stroke="#A9700F" strokeWidth="1.2" opacity=".75" fill="none" />
    </svg>
  );
}

function Contactless() {
  return (
    <svg viewBox="0 0 24 24" className="mb-1 h-7 w-7 shrink-0 text-white/70" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M6 9.5a4 4 0 0 1 0 5M9.5 7a7.5 7.5 0 0 1 0 10M13 4.5a11 11 0 0 1 0 15M16.5 2a14.5 14.5 0 0 1 0 20" />
    </svg>
  );
}
