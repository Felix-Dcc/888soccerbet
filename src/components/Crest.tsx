"use client";
import { useState } from "react";
import Image from "next/image";
import { sized } from "@/lib/images";

// px = rendered size; Next's optimizer serves 1x/2x WebP/AVIF at exactly this size.
const SIZES = {
  xs: { box: "h-5 w-5", text: "text-[8px]", px: 20 },
  sm: { box: "h-7 w-7", text: "text-[10px]", px: 28 },
  md: { box: "h-10 w-10", text: "text-xs", px: 40 },
  lg: { box: "h-16 w-16", text: "text-base", px: 64 },
  xl: { box: "h-20 w-20 sm:h-24 sm:w-24", text: "text-xl", px: 96 },
} as const;

/** Stable hue per name so fallback initials are distinguishable but never random between renders. */
function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string) {
  const words = name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)).toUpperCase();
}

/**
 * A team or competition badge. Only verified badges are passed in. Initials sit underneath
 * while the image loads (never a blank circle) and stay if it's missing or fails.
 */
export function Crest({ name, src, size = "sm" }: { name: string; src: string | null; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const url = sized(src, "small"); // 250px source; the optimizer scales it down
  const showInitials = !url || state !== "ok";

  return (
    <span className={`${s.box} relative inline-grid shrink-0 place-items-center`}>
      {showInitials && (
        <span
          aria-hidden
          className={`${s.text} absolute inset-0 grid place-items-center rounded-full font-bold text-white/90 ring-1 ring-white/10`}
          style={{ background: `linear-gradient(135deg, hsl(${hue(name)} 45% 32%), hsl(${(hue(name) + 40) % 360} 45% 20%))` }}
        >
          {initials(name)}
        </span>
      )}
      {url && state !== "failed" && (
        <Image
          src={url}
          alt=""
          width={s.px}
          height={s.px}
          loading="lazy"
          onLoad={() => setState("ok")}
          onError={() => setState("failed")}
          className={`relative h-full w-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,.5)] transition-opacity duration-300 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
