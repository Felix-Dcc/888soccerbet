import Image from "next/image";
import { Check } from "lucide-react";
import { Logo } from "./Logo";
import { photos } from "@/lib/photos";

const POINTS = ["Deposit and withdraw with mobile money", "Cash out before the final whistle", "Set your own deposit limits"];

/**
 * Auth layout: a photo panel with the brand and what the account gets you (desktop only), and the
 * form in its own column. `footer` is the switch to the other auth page, under the form.
 */
export function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-xl border border-line bg-ink-800 shadow-lift lg:min-h-[640px] lg:grid-cols-[5fr_6fr]">
      <aside className="relative hidden lg:block">
        <Image src={photos.pitchAerialPortrait} alt="" fill priority placeholder="blur" sizes="420px" className="object-cover" />
        {/* Scrim so the copy stays readable whatever part of the photo sits behind it. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/40" />
        <div className="relative flex h-full flex-col justify-between p-10 text-snow">
          <Logo className="h-12 self-start" />
          <div>
            <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight">
              Every match.
              <br />
              Every market.
            </h2>
            <ul className="mt-6 space-y-3">
              {POINTS.map((p) => (
                <li key={p} className="flex items-center gap-3 text-sm text-snow/85">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-lime text-lime-ink">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-snow/60">18+ only. Please gamble responsibly.</p>
        </div>
      </aside>

      <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="mb-8 h-10 lg:hidden" />
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-fog">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <p className="mt-8 border-t border-line pt-6 text-center text-sm text-fog">{footer}</p>}
        </div>
      </div>
    </div>
  );
}
