import type { Config } from "tailwindcss";

/**
 * 888SoccerBet tokens. Colours are CSS variables (src/app/globals.css) so one class works in
 * both palettes: the site is light, and `.theme-dark` re-scopes a block (photo heroes) to the
 * dark palette. `white` is the foreground token, so `text-white` = main text colour.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: v("fg"),
        snow: "#FFFFFF", // always white, whatever the scope
        ink: { DEFAULT: v("ink-900"), 900: v("ink-900"), 800: v("ink-800"), 700: v("ink-700"), 600: v("ink-600"), 500: v("ink-500"), 400: v("ink-400") },
        line: v("line"),
        fog: { DEFAULT: v("fog"), muted: v("fog-muted") },
        lime: { DEFAULT: v("lime"), 600: v("lime-600"), ink: v("lime-ink") },
        gold: { DEFAULT: v("gold"), 600: v("gold-600"), ink: v("gold-ink") }, // the crown gold: value (odds, balance, bonuses)
        teal: { DEFAULT: v("teal"), 600: v("teal") },
        danger: v("danger"),
        warn: v("warn"),
        win: v("teal"),
        lose: v("danger"),
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "sans-serif"],
      },
      borderRadius: { xl2: "1rem" },
      boxShadow: {
        card: "var(--shadow-card)",
        lift: "var(--shadow-lift)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pop: { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.08)" }, "100%": { transform: "scale(1)" } },
        "slide-up": { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        ping2: { "75%,100%": { transform: "scale(2.2)", opacity: "0" } },
        "win-pop": { "0%": { transform: "scale(.6)", opacity: "0" }, "60%": { transform: "scale(1.04)", opacity: "1" }, "100%": { transform: "scale(1)" } },
        "win-trophy": { "0%": { transform: "translateY(24px) scale(.7)", opacity: "0" }, "55%": { transform: "translateY(-6px) scale(1.06)", opacity: "1" }, "100%": { transform: "none" } },
        "win-rays": { to: { transform: "rotate(360deg)" } },
        "win-confetti": { "0%": { transform: "translateY(-20px) rotate(0deg)", opacity: "1" }, "100%": { transform: "translateY(105vh) rotate(540deg)", opacity: "0.2" } },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
        pop: "pop .25s ease-out",
        "slide-up": "slide-up .28s cubic-bezier(.2,.8,.2,1)",
        "fade-in": "fade-in .35s ease-out both",
        ping2: "ping2 1.4s cubic-bezier(0,0,.2,1) infinite",
        "win-pop": "win-pop .45s cubic-bezier(.2,.8,.2,1) both",
        "win-trophy": "win-trophy .7s .15s cubic-bezier(.2,.8,.2,1) both",
        "win-rays": "win-rays 18s linear infinite",
        "win-confetti": "win-confetti 3s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
