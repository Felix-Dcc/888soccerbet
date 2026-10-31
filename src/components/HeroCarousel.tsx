"use client";
import { Children, useEffect, useRef, useState } from "react";

const AUTOPLAY_MS = 7000;
const SWIPE_PX = 40; // a drag shorter than this snaps back to the current slide

/**
 * Sliding hero. Phones and tablets swipe it with a finger (vertical page scrolling still works);
 * laptops get ‹ › arrows on its edges; the arrow keys work once it has focus. Dots sit below the
 * frame so they never cover a banner's own text or buttons. Accessible: labelled slides, hidden
 * slides are inert, autoplay pauses on hover/focus/touch and is off for reduced-motion users.
 */
export function HeroCarousel({
  labels,
  children,
  aspect = "aspect-[16/9] sm:aspect-[2/1] lg:aspect-[12/5]",
}: {
  labels: string[];
  children: React.ReactNode;
  aspect?: string;
}) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true); // assume reduced until measured: no surprise motion
  const [drag, setDrag] = useState<number | null>(null); // finger offset in px while swiping
  const touch = useRef<{ id: number; x: number; y: number; horizontal: boolean | null } | null>(null);
  const swiped = useRef(false); // swallow the click that ends a swipe, so a banner link doesn't open

  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    if (paused || reduced || count < 2 || drag !== null) return;
    const t = setTimeout(() => setI((n) => (n + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [i, paused, reduced, count, drag]);

  const go = (n: number) => setI(((n % count) + count) % count);

  const onPointerDown = (e: React.PointerEvent) => {
    swiped.current = false; // every new press starts clean, mouse included
    if (e.pointerType === "mouse" || count < 2) return; // laptops use the arrows
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, horizontal: null };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = touch.current;
    if (!t || e.pointerId !== t.id) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (t.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      t.horizontal = Math.abs(dx) > Math.abs(dy); // decide once: swipe the slider, or let the page scroll
      if (!t.horizontal) return (touch.current = null);
      try {
        e.currentTarget.setPointerCapture(e.pointerId); // keep getting moves if the finger leaves the frame
      } catch {
        /* capture is a nicety; the swipe works without it */
      }
    }
    setDrag(dx);
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t?.horizontal) return;
    const dx = e.clientX - t.x;
    swiped.current = Math.abs(dx) > 8;
    if (dx <= -SWIPE_PX) go(i + 1);
    else if (dx >= SWIPE_PX) go(i - 1);
    setDrag(null);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Highlights"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(i + 1);
        if (e.key === "ArrowLeft") go(i - 1);
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="space-y-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-lime/60"
    >
      <div
        className={`theme-dark group relative touch-pan-y select-none overflow-hidden rounded-xl border border-white/[0.08] bg-ink-800 shadow-lift ${aspect}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          if (!swiped.current || (e.target as HTMLElement).closest("button[aria-label$='slide']")) return;
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(${-i * 100}% + ${drag ?? 0}px))`,
            transition: drag !== null || reduced ? "none" : "transform 500ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          {slides.map((slide, n) => (
            <div
              key={n}
              role="group"
              aria-roledescription="slide"
              aria-label={`${n + 1} of ${count}: ${labels[n] ?? ""}`}
              aria-hidden={n !== i}
              inert={n !== i}
              className="h-full w-full shrink-0"
            >
              {slide}
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <Arrow dir={-1} onClick={() => go(i - 1)} />
            <Arrow dir={1} onClick={() => go(i + 1)} />
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex justify-center gap-1.5">
          {slides.map((_, n) => (
            <button
              key={n}
              onClick={() => go(n)}
              aria-label={`Show slide ${n + 1}: ${labels[n] ?? ""}`}
              aria-current={n === i}
              className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-lime" : "w-1.5 bg-fog-muted/50 hover:bg-fog"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Edge arrow for laptops and desktops; phones swipe instead. */
function Arrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir < 0 ? "Previous slide" : "Next slide"}
      className={`absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-2xl leading-none text-white opacity-0 backdrop-blur transition hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100 md:grid ${
        dir < 0 ? "left-3" : "right-3"
      }`}
    >
      <span aria-hidden className="-mt-0.5">
        {dir < 0 ? "‹" : "›"}
      </span>
    </button>
  );
}
