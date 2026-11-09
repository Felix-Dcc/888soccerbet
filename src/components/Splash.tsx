const LETTERS = ["B", "E", "T"];

/**
 * Brand loading screen shown when the site is opened (once per browser tab session).
 * "Kick-off", ~2s: the centre circle and halfway line draw in -> the ball rolls in, spinning,
 * behind a green speed trail -> B, E, T rise in turn -> ZONE slides in -> the crown drops onto
 * the B. Plain server-rendered SVG + CSS, so it paints in the first bytes;
 * SPLASH_SCRIPT (in <head>) decides whether to show it and when to fade it out. Every element's
 * resting style is its final frame, so reduced-motion users see the finished logo.
 */
export function Splash() {
  return (
    <div id="kb-splash" className="theme-dark" role="status" aria-live="polite" aria-label="Loading Bet Zone">
      <svg className="sb-pitch" viewBox="0 0 400 400" aria-hidden>
        <circle cx="200" cy="200" r="150" pathLength={1} />
        <path d="M-200 200H600" pathLength={1} />
        <circle className="sb-spot" cx="200" cy="200" r="4" />
      </svg>

      <svg className="sb-run" viewBox="0 0 260 64" aria-hidden>
        <path className="sb-trail" d="M8 46C70 44 130 40 196 32" pathLength={1} />
        <path className="sb-trail sb-trail-thin" d="M40 56C96 54 146 50 196 42" pathLength={1} />
        <g className="sb-ball">
          <g className="sb-ball-spin">
            <circle cx="0" cy="0" r="22" fill="#FFFFFF" stroke="#0B0F14" strokeWidth="1.5" />
            <path d="M0-9 8.6-2.8 5.3 7.3H-5.3L-8.6-2.8Z" fill="#0B0F14" />
            <g stroke="#0B0F14" strokeWidth="1.5" strokeLinecap="round">
              <path d="M0-9v-12M8.6-2.8l11.4-3.7M5.3 7.3l7 9.7M-5.3 7.3l-7 9.7M-8.6-2.8-20-6.5" />
            </g>
          </g>
        </g>
      </svg>

      <p className="sb-word font-display font-extrabold tracking-tight" aria-hidden>
        <span className="sb-888">
          <svg className="sb-crown" viewBox="5 6 22 17">
            <path d="M7.5 21.2 6 11.2l5.6 4.3L16 7.8l4.4 7.7 5.6-4.3-1.5 10Z" fill="#58F800" />
            <path d="M7.5 22.2h17v1.6h-17Z" fill="#2E9E00" />
          </svg>
          {LETTERS.map((d, i) => (
            <span key={i} className="sb-mask">
              <span className="sb-digit" style={{ animationDelay: `${0.85 + i * 0.1}s` }}>
                {d}
              </span>
            </span>
          ))}
        </span>
        <span className="sb-mask">
          <span className="sb-bet">ZONE</span>
        </span>
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
export const SPLASH_SCRIPT = `(function(){var d=document.documentElement;try{if(sessionStorage.getItem("kb.splash")){d.classList.add("kb-splash-off");return}sessionStorage.setItem("kb.splash","1")}catch(e){}var t0=Date.now(),MIN=2300,MAX=6000,gone=false;function hide(){if(gone)return;gone=true;d.classList.add("kb-splash-done")}function onLoad(){setTimeout(hide,Math.max(0,MIN-(Date.now()-t0)))}if(document.readyState==="complete")onLoad();else window.addEventListener("load",onLoad);setTimeout(hide,MAX)})();`;
