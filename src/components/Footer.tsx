import { Logo } from "./Logo";
import { GhanaFlag } from "./GhanaFlag";

/** Only pages that exist. Nothing here advertises a product or document the site doesn't have. */
export function Footer() {
  return (
    <footer className="mt-6 border-t border-line bg-ink-800 pb-28 lg:pb-10">
      <div className="h-0.5 bg-lime" />

      <div className="mx-auto max-w-[1280px] px-4 pt-10">
        <span className="inline-flex items-center gap-2.5">
          <Logo />
          <GhanaFlag className="h-3.5 w-5" />
          <span className="font-display text-sm font-bold tracking-wide text-white">Ghana</span>
        </span>
        <p className="mt-3 max-w-xs text-sm text-fog">Football and basketball odds, priced in cedis.</p>
      </div>

      {/* Age and harm warning, the way a licensed book is required to carry it. */}
      <div className="mx-auto mt-10 flex max-w-[1280px] items-center justify-end gap-3 border-t border-line px-4 pt-5">
        <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-danger text-[11px] font-extrabold text-white">18+</span>
        <p className="text-xs text-fog">Age 18 and above only. Play responsibly — betting is addictive and can be psychologically harmful.</p>
      </div>
    </footer>
  );
}
