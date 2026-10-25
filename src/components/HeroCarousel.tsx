"use client";
import { Children, useEffect, useState } from "react";

const AUTOPLAY_MS = 7000;

/**
 * Cross-fading hero. Accessible: labelled slides, dot controls, hidden slides are inert (no
 * tabbing into them), autoplay pauses on hover/focus and is off for reduced-motion users.
 */
export function HeroCarousel({ labels, children }: { labels: string[]; children: React.ReactNode }) {
  const slides = Children.toArray(children);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true); // assume reduced until measured: no surprise motion

  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    if (paused || reduced || slides.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % slides.length), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [i, paused, reduced, slides.length]);

  const go = (n: number) => setI((n + slides.length) % slides.length);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Highlights"
      className="theme-dark group relative aspect-[16/9] overflow-hidden lg:aspect-[12/5] rounded-xl border border-white/[0.08] bg-ink-800 shadow-lift sm:aspect-[2/1]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((slide, n) => (
        <div
          key={n}
          role="group"
          aria-roledescription="slide"
          aria-label={`${n + 1} of ${slides.length}: ${labels[n] ?? ""}`}
          aria-hidden={n !== i}
          inert={n !== i}
          className={`absolute inset-0 transition-opacity duration-700 ${n === i ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {slide}
        </div>
      ))}

      {slides.length > 1 && (
        <>
          {/* One centred control bar; slides keep their bottom strip free (side/corner arrows covered content). */}
          <div className="absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-2">
            <Arrow dir={-1} onClick={() => go(i - 1)} />
            <div className="flex gap-1.5">
              {slides.map((_, n) => (
                <button
                  key={n}
                  onClick={() => go(n)}
                  aria-label={`Show slide ${n + 1}: ${labels[n] ?? ""}`}
                  aria-current={n === i}
                  className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-lime" : "w-1.5 bg-white/40 hover:bg-white/70"}`}
                />
              ))}
            </div>
            <Arrow dir={1} onClick={() => go(i + 1)} />
          </div>
        </>
      )}
    </section>
  );
}

function Arrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir < 0 ? "Previous slide" : "Next slide"}
      className="hidden h-6 w-6 place-items-center rounded-full bg-black/45 text-base leading-none text-white backdrop-blur transition hover:bg-black/70 sm:grid"
    >
      {dir < 0 ? "‹" : "›"}
    </button>
  );
}
