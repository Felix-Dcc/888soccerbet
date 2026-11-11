"use client";
import { useLayoutEffect, useRef } from "react";

/** Text that shrinks (down to 12px) to fit its width on one line; if even that is too wide, it wraps instead of being cut off. */
export function FitText({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    let width = -1;
    const fit = () => {
      if (box.clientWidth === width) return; // only a width change can change the fit (avoids resize loops)
      width = box.clientWidth;
      el.style.fontSize = "";
      el.style.whiteSpace = "";
      const over = el.scrollWidth / width;
      if (over <= 1) return;
      el.style.fontSize = `${Math.max(12, Math.floor((parseFloat(getComputedStyle(el).fontSize) / over) * 10) / 10)}px`;
      if (el.scrollWidth > width) el.style.whiteSpace = "normal";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  });
  return (
    <span ref={ref} className="inline-block whitespace-nowrap">
      {children}
    </span>
  );
}
