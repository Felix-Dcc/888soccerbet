import { useId } from "react";
import Image from "next/image";
import logoArt from "../../public/img/brand/888soccerbet-logo.png";

/** Brand colours are fixed assets, not theme tokens: they must hold in any palette or email client. */
const GREEN = "#3CDC3C";

/**
 * Square mark — the crown over a football on a dark tile — for places that need an icon
 * (collapsed admin rail). The browser-tab favicon is the logo's own football (src/app/icon.png).
 */
export function BrandMark({ size = 30, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1C2533" />
          <stop offset="1" stopColor="#0B0F14" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE7A3" />
          <stop offset=".5" stopColor="#F5C451" />
          <stop offset="1" stopColor="#C98A1B" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}t)`} />
      <rect x=".5" y=".5" width="31" height="31" rx="8.5" fill="none" stroke={GREEN} strokeOpacity=".45" />
      <g fill={`url(#${id}g)`}>
        <path d="M10.4 11.4 9.3 6.2l3.3 2.4L16 4.3l3.4 4.3 3.3-2.4-1.1 5.2Z" />
        <rect x="10.3" y="12" width="11.4" height="1.9" rx=".8" />
      </g>
      <circle cx="9.3" cy="5.3" r="1.05" fill={`url(#${id}g)`} />
      <circle cx="22.7" cy="5.3" r="1.05" fill={`url(#${id}g)`} />
      <circle cx="16" cy="3.4" r="1.15" fill={`url(#${id}g)`} />
      <circle cx="16" cy="21.2" r="6.8" fill="#FFFFFF" stroke="#0B0F14" strokeWidth=".9" />
      <path d="M16 17.1l3.2 2.3-1.2 3.8h-4l-1.2-3.8z" fill="#0B0F14" />
      <g stroke="#0B0F14" strokeWidth=".85" strokeLinecap="round">
        <path d="M16 17.1v-2.6M12.8 19.4l-2.4-.8M19.2 19.4l2.4-.8M14 23.2l-1.5 2.2M18 23.2l1.5 2.2" />
      </g>
    </svg>
  );
}

/** "888SOCCERBET" wordmark — caps, with BET in the brand green, as in the lockup. */
export function Wordmark() {
  return (
    <span className="whitespace-nowrap tracking-tight">
      888SOCCER<span style={{ color: GREEN }}>BET</span>
    </span>
  );
}

/** The supplied logo, cut out of its stadium artwork so it sits on any dark surface. */
export function Logo({ className = "h-11" }: { className?: string }) {
  return <Image src={logoArt} alt="888SoccerBet" width={168} height={90} className={`w-auto ${className}`} />;
}
