import { TrendingUp } from "lucide-react";

/**
 * Brand loading screen shown when the site is opened (once per browser tab session), ~1.4s:
 * a green streak traces a ring -> the logo tile pops in and a light sweep crosses it -> "Bet
 * Zone · SPORTSBOOK" comes into focus beside it -> a comet keeps orbiting the ring and a soft
 * glow breathes behind until the page is ready. Server-rendered markup + CSS (no images), so it
 * paints in the first bytes, in the visitor's own theme. SPLASH_SCRIPT (in <head>) decides
 * whether to show it and when to fade it out. Every element's resting style is its final frame,
 * so reduced-motion users see the finished logo.
 */
export function Splash() {
  return (
    <div id="kb-splash" role="status" aria-live="polite" aria-label="Loading Bet Zone">
      <div className="bz-stage" aria-hidden>
        <div className="bz-glow" />
        <svg className="bz-ring" viewBox="0 0 200 200">
          <circle className="bz-ring-trace" cx="100" cy="100" r="92" pathLength={1} />
        </svg>
        <svg className="bz-comet" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="92" pathLength={1} />
        </svg>
        <div className="bz-mark">
          <span className="bz-tile">
            <TrendingUp strokeWidth={2} className="bz-arrow" />
          </span>
          <span className="bz-word">
            <span className="bz-name font-display">Bet Zone</span>
            <span className="bz-tag font-display">Sportsbook</span>
          </span>
        </div>
      </div>
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
export const SPLASH_SCRIPT = `(function(){var d=document.documentElement;try{if(sessionStorage.getItem("kb.splash")){d.classList.add("kb-splash-off");return}sessionStorage.setItem("kb.splash","1")}catch(e){}var t0=Date.now(),MIN=1400,MAX=4000,gone=false;function hide(){if(gone)return;gone=true;d.classList.add("kb-splash-done")}function onLoad(){setTimeout(hide,Math.max(0,MIN-(Date.now()-t0)))}if(document.readyState==="complete")onLoad();else window.addEventListener("load",onLoad);setTimeout(hide,MAX)})();`;
