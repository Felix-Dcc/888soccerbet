"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked (insecure context); the text stays visible to copy by hand */
        }
      }}
      className="btn-ghost px-3 py-1.5 text-xs"
    >
      {done ? "Copied" : label}
    </button>
  );
}
