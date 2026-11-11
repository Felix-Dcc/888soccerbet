"use client";
import { Children, useEffect, useRef, useState } from "react";

const AUTOPLAY_MS = 3800; // a new slide every 3.8 s
const SLIDE_MS = 800; // each slide glides in over 0.8 s
const SWIPE_PX = 40; // a drag shorter than this snaps back to the current slide

/**
 * Promo banner carousel: 3:1 banners (made at 1440x480) that glide forward on their own and loop
 * endlessly (after the last comes the first again, never a rewind), with small dots on the image.
 * Swipe with a finger or drag with the mouse; the dots and arrow keys jump. Accessible: labelled
 * slides, hidden slides are inert, autoplay pauses on hover/focus/touch and is off for reduced-motion users.
 */
export function HeroCarousel({
  labels,
  children,
  aspect = "aspect-[3/1]",
}: {
  labels: string[];
  children: React.ReactNode;
  aspect?: string;
}) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const loop = count > 1;
  // Track: [copy of last, ...slides, copy of first]. pos 1 is the first real slide.
  const track = loop ? [slides[count - 1], ...slides, slides[0]] : slides;
  const [pos, setPos] = useState(loop ? 1 : 0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true); // assume reduced until measured: no surprise motion
  const [drag, setDrag] = useState<number | null>(null); // pointer offset in px while swiping
  const press = useRef<{ id: number; x: number; y: number; horizontal: boolean | null } | null>(null);
  const swiped = useRef(false); // swallow the click that ends a swipe, so a banner link doesn't open
  const active = loop ? (pos - 1 + count) % count : 0;

  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    if (paused || reduced || !loop || drag !== null) return;
    const t = setTimeout(() => {
      setAnimate(true);
      setPos((p) => p + 1);
    }, AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [pos, paused, reduced, loop, drag]);

  // After gliding onto a copy at either end, jump (without animation) to the real slide it copies.
  const onTransitionEnd = () => {
    if (pos === count + 1) jumpTo(1);
    else if (pos === 0) jumpTo(count);
  };
  const jumpTo = (p: number) => {
    setAnimate(false);
    setPos(p);
  };
  // Turn the animation back on once the jump has been painted.
  useEffect(() => {
    if (animate) return;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  const step = (d: 1 | -1) => {
    if (!loop || pos === 0 || pos === count + 1) return; // mid-wrap: let the jump land first
    setAnimate(true);
    setPos((p) => p + d);
  };
  const show = (n: number) => {
    setAnimate(true);
    setPos(n + 1);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    swiped.current = false; // every new press starts clean
    if (!loop || (e.pointerType === "mouse" && e.button !== 0)) return;
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, horizontal: null };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (p.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      p.horizontal = Math.abs(dx) > Math.abs(dy); // decide once: swipe the banner, or let the page scroll
      if (!p.horizontal) return (press.current = null);
      try {
        e.currentTarget.setPointerCapture(e.pointerId); // keep getting moves if the pointer leaves the frame
      } catch {
        /* capture is a nicety; the swipe works without it */
      }
    }
    setDrag(dx);
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p?.horizontal) return;
    const dx = e.clientX - p.x;
    swiped.current = Math.abs(dx) > 8;
    setDrag(null);
    if (dx <= -SWIPE_PX) step(1);
    else if (dx >= SWIPE_PX) step(-1);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotions"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") step(1);
        if (e.key === "ArrowLeft") step(-1);
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-lime/60 md:rounded-[20px]"
    >
      <div
        className={`relative touch-pan-y select-none overflow-hidden rounded-lg bg-ink-800 md:rounded-[20px] ${aspect}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          if (!swiped.current || (e.target as HTMLElement).closest("button[aria-label^='Show slide']")) return;
          e.preventDefault();
          e.stopPropagation();
          swiped.current = false;
        }}
      >
        <div
          className="flex h-full"
          onTransitionEnd={(e) => e.target === e.currentTarget && onTransitionEnd()}
          style={{
            transform: `translateX(calc(${-pos * 100}% + ${drag ?? 0}px))`,
            transition: drag !== null || reduced || !animate ? "none" : `transform ${SLIDE_MS}ms ease`,
          }}
        >
          {track.map((slide, n) => {
            const real = loop ? n - 1 : n; // -1 and count are the copies at the ends
            const copy = real < 0 || real >= count;
            return (
              <div
                key={n}
                {...(copy
                  ? { "aria-hidden": true }
                  : { role: "group", "aria-roledescription": "slide", "aria-label": `${real + 1} of ${count}: ${labels[real] ?? ""}`, "aria-hidden": real !== active })}
                inert={copy || real !== active}
                className="h-full w-full shrink-0"
              >
                {slide}
              </div>
            );
          })}
        </div>

        {loop && (
          <div className="absolute inset-x-0 bottom-1.5 z-10 flex justify-center gap-1 md:bottom-2.5 md:gap-2">
            {slides.map((_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => show(n)}
                aria-label={`Show slide ${n + 1}: ${labels[n] ?? ""}`}
                aria-current={n === active}
                className={`size-1 rounded-full bg-white transition-opacity md:size-1.5 ${n === active ? "opacity-100" : "opacity-80 hover:opacity-100"}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
