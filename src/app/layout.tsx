import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Sora, Manrope, Exo_2 } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { SideNav, type NavData } from "@/components/SideNav";
import { Footer, SupportFab } from "@/components/Footer";
import { Splash, SPLASH_SCRIPT } from "@/components/Splash";
import { THEME_SCRIPT } from "@/lib/theme";
import { minStakeGhs } from "@/lib/betEngine";
import { bonusRules } from "@/lib/bonus";
import { HotMatches } from "@/components/HotMatches";
import { hotFixtures, listCompetitions, listFixtures, listSports } from "@/lib/queries";

const display = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body" });
// The wordmark: heavy, wide, forward-leaning lettering.
const brand = Exo_2({ subsets: ["latin"], weight: ["800", "900"], style: ["italic"], variable: "--font-brand" });

export const metadata: Metadata = {
  title: "Bet Zone — Sports Betting",
  description: "Football and basketball odds across the Premier League, Champions League, La Liga, Serie A, Bundesliga and NBA.",
  // iOS Safari would turn match IDs, odds and booking codes into tel:/mailto: links before React
  // loads, breaking hydration (and making an ID tappable to call it).
  formatDetection: { telephone: false, email: false, address: false, date: false },
};
export const viewport: Viewport = { themeColor: "#F8FBF9", width: "device-width", initialScale: 1 };
// The slip's minimum stake comes from Platform Settings (DB), so no page may be pre-rendered at build time.
export const dynamic = "force-dynamic";

/** Navigation data for the rail. A database outage degrades to an empty nav, not a broken page. */
async function navData(): Promise<NavData> {
  try {
    const [sports, competitions, live] = await Promise.all([listSports(), listCompetitions(), listFixtures({ live: true, take: 200 })]);
    const perSport = new Map<string, number>();
    for (const c of competitions) perSport.set(c.sportKey, (perSport.get(c.sportKey) ?? 0) + c.count);
    return {
      sports: sports.map((s) => ({ key: s.key, name: s.name, count: perSport.get(s.key) ?? 0 })),
      competitions,
      liveCount: live.length,
    };
  } catch (e) {
    console.error("[layout] nav data unavailable:", e instanceof Error ? e.message : e);
    return { sports: [], competitions: [], liveCount: 0 };
  }
}

/** Streams in after the shell, so the first bytes (and the loading screen) never wait on the database. */
async function SideNavWithData() {
  return <SideNav data={await navData()} />;
}

/** Most-backed fixtures for the betslip rail; a database hiccup just drops the panel. */
async function HotMatchesWithData() {
  try {
    return <HotMatches fixtures={await hotFixtures()} />;
  } catch (e) {
    console.error("[layout] hot matches unavailable:", e instanceof Error ? e.message : e);
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const minStake = await minStakeGhs();
  return (
    // White is the default; the head script removes it for players who chose dark, and adds a
    // splash class, before hydration. Those differences are expected.
    <html lang="en" data-theme="light" className={`${display.variable} ${body.variable} ${brand.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
        <noscript>
          <style>{"#kb-splash{display:none}"}</style>
        </noscript>
      </head>
      <body className="font-sans antialiased">
        <Splash />
        <AppShell
          minStakeGhs={minStake}
          bonus={bonusRules()}
          footer={<Footer />}
          sidebar={
            <Suspense>
              <SideNavWithData />
            </Suspense>
          }
          rail={
            <Suspense>
              <HotMatchesWithData />
            </Suspense>
          }
        >
          {children}
        </AppShell>
        <SupportFab />
      </body>
    </html>
  );
}
