import { Wordmark } from "./Logo";

// Crown geometry shared with the CrownMark logo (32-unit box), so the reveal draws the real mark.
const BODY = "M7.5 21.2 6 11.2l5.6 4.3L16 7.8l4.4 7.7 5.6-4.3-1.5 10Z";
const BAND = "M7.5 22.2h17v3h-17Z";
const SPARKS = [8, 19, 27, 36, 44, 52, 61, 69, 77, 88]; // % across the beam; fixed so every render matches

/**
 * Brand loading screen shown when the site is opened (once per browser tab session).
 * Reveal, ~1.8s: spotlight and sparks fade in -> the crown's outline draws itself -> gold fills
 * in and the jewels pop -> a light glint sweeps across -> "888SoccerBet" tracks in from blur ->
 * the little crown drops onto the "z". Plain server-rendered SVG + CSS, so it paints in the
 * first bytes; SPLASH_SCRIPT (in <head>) decides whether to show it and when to fade it out.
 * Every element's resting style is its final frame, so reduced-motion users see the finished logo.
 */
export function Splash() {
  return (
    <div id="kb-splash" className="theme-dark" role="status" aria-live="polite" aria-label="Loading 888SoccerBet">
      <div className="kb-splash-beam" aria-hidden />
      <div className="kb-splash-sparks" aria-hidden>
        {SPARKS.map((x, i) => (
          <span key={x} style={{ left: `${x}%`, animationDelay: `${0.2 + (i % 5) * 0.28}s`, animationDuration: `${1.6 + (i % 3) * 0.5}s` }} />
        ))}
      </div>
      <div className="kb-splash-glow" aria-hidden />

      <svg className="kb-crown" viewBox="3.5 4.5 25 22" aria-hidden>
        <defs>
          <linearGradient id="kbs-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFE7A3" />
            <stop offset=".5" stopColor="#F5C451" />
            <stop offset="1" stopColor="#C98A1B" />
          </linearGradient>
          <linearGradient id="kbs-shine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="kbs-clip">
            <path d={BODY} />
            <path d={BAND} />
          </clipPath>
        </defs>
        <g className="kb-crown-fill" fill="url(#kbs-gold)">
          <path d={BODY} />
          <path d={BAND} />
        </g>
        <g className="kb-crown-line" fill="none" stroke="#FFE7A3" strokeWidth=".45" strokeLinejoin="round">
          <path d={BODY} pathLength={1} />
          <path d={BAND} pathLength={1} />
        </g>
        <g clipPath="url(#kbs-clip)">
          {/* The slant lives on the group: a CSS transform on the rect would replace an SVG transform attribute. */}
          <g transform="skewX(-20)">
            <rect className="kb-crown-glint" x="-4" y="2" width="5" height="28" fill="url(#kbs-shine)" />
          </g>
        </g>
        <circle className="kb-jewel" style={{ animationDelay: ".85s" }} cx="6" cy="10.6" r="1.5" fill="url(#kbs-gold)" />
        <circle className="kb-jewel" style={{ animationDelay: ".95s" }} cx="26" cy="10.6" r="1.5" fill="url(#kbs-gold)" />
        <circle className="kb-jewel" style={{ animationDelay: "1.1s" }} cx="16" cy="6.9" r="1.8" fill="#3CDC3C" />
        <circle className="kb-jewel" style={{ animationDelay: "1.15s" }} cx="16" cy="23.7" r=".95" fill="#3CDC3C" />
      </svg>

      <p className="kb-splash-word font-display text-4xl font-extrabold tracking-tight text-snow" aria-hidden>
        <Wordmark />
      </p>
      <div className="kb-splash-bar" aria-hidden>
        <span />
      </div>
    </div>
  );
}

/**
 * Runs in <head> before the page paints:
 *  - already shown in this tab session -> hide it immediately (no flash on reloads)
 *  - otherwise fade it out once the page has loaded and the reveal has played (MIN), and in
 *    any case after MAX so a slow image can never trap the visitor.
 */
export const SPLASH_SCRIPT = `(function(){var d=document.documentElement;try{if(sessionStorage.getItem("kb.splash")){d.classList.add("kb-splash-off");return}sessionStorage.setItem("kb.splash","1")}catch(e){}var t0=Date.now(),MIN=1900,MAX=6000,gone=false;function hide(){if(gone)return;gone=true;d.classList.add("kb-splash-done")}function onLoad(){setTimeout(hide,Math.max(0,MIN-(Date.now()-t0)))}if(document.readyState==="complete")onLoad();else window.addEventListener("load",onLoad);setTimeout(hide,MAX)})();`;
