"use client";
import { useRef, useState, useCallback, useEffect } from "react";

export function DraggableSupportFab({ url }: { url: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [placed, setPlaced] = useState(false);
  const dragging = useRef(false);
  const wasDragged = useRef(false);
  const start = useRef({ x: 0, y: 0, px: 0, py: 0 });

  useEffect(() => {
    const pad = 16;
    setPos({ x: window.innerWidth - 72 - pad, y: window.innerHeight - 160 });
    setPlaced(true);
  }, []);

  const onDown = useCallback((clientX: number, clientY: number) => {
    dragging.current = true;
    wasDragged.current = false;
    start.current = { x: pos.x, y: pos.y, px: clientX, py: clientY };
  }, [pos]);

  const onMove = useCallback((clientX: number, clientY: number) => {
    if (!dragging.current) return;
    const dx = clientX - start.current.px;
    const dy = clientY - start.current.py;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) wasDragged.current = true;
    const w = 72, h = 80;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - w, start.current.x + dx)),
      y: Math.max(0, Math.min(window.innerHeight - h, start.current.y + dy)),
    });
  }, []);

  const onUp = useCallback(() => { dragging.current = false; }, []);

  useEffect(() => {
    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); };
    const mu = () => onUp();
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    window.addEventListener("touchmove", tm, { passive: true });
    window.addEventListener("touchend", mu);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("touchmove", tm);
      window.removeEventListener("touchend", mu);
    };
  }, [onMove, onUp]);

  if (!placed) return null;

  return (
    <a
      ref={ref}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Customer support on Telegram"
      onClick={(e) => { if (wasDragged.current) e.preventDefault(); }}
      onMouseDown={(e) => { e.preventDefault(); onDown(e.clientX, e.clientY); }}
      onTouchStart={(e) => { if (e.touches[0]) onDown(e.touches[0].clientX, e.touches[0].clientY); }}
      className="fixed z-50 flex cursor-grab flex-col items-center gap-1 active:cursor-grabbing"
      style={{ left: pos.x, top: pos.y, touchAction: "none" }}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-lime shadow-lg shadow-lime/30">
        <svg width="32" height="32" viewBox="0 0 100 100" fill="white" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          {/* Head circle */}
          <circle cx="40" cy="36" r="16" />
          {/* Headset band */}
          <path d="M18 44V36a22 22 0 0 1 44 0v8" fill="none" stroke="white" strokeWidth="4" />
          {/* Left ear cup */}
          <rect x="12" y="38" width="8" height="14" rx="3" />
          {/* Right ear cup */}
          <rect x="60" y="38" width="8" height="14" rx="3" />
          {/* Mic arm from left cup curving down */}
          <path d="M16 52c0 6 5 10 12 10h4" fill="none" stroke="white" strokeWidth="3.5" />
          {/* Mic ball */}
          <circle cx="33" cy="62" r="3.5" />
          {/* Shoulders/body */}
          <path d="M10 92c0-14 13-22 30-22s30 8 30 22z" />
          {/* Speech bubble */}
          <rect x="60" y="4" width="34" height="24" rx="6" />
          <polygon points="66,28 72,36 78,28" />
          {/* Dots */}
          <circle cx="70" cy="16" r="2.5" fill="rgb(var(--lime))" />
          <circle cx="77" cy="16" r="2.5" fill="rgb(var(--lime))" />
          <circle cx="84" cy="16" r="2.5" fill="rgb(var(--lime))" />
        </svg>
      </span>
      <span className="rounded-full bg-black/70 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">Need help?</span>
    </a>
  );
}
