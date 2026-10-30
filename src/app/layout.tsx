import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Sora, Manrope } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { SideNav, type NavData } from "@/components/SideNav";
import { Footer } from "@/components/Footer";
import { Splash, SPLASH_SCRIPT } from "@/components/Splash";
import { minStakeGhs } from "@/lib/betEngine";
import { bonusRules } from "@/lib/bonus";
import { listCompetitions, listFixtures, listSports } from "@/lib/queries";

const display = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Kingz Bet — Sports Betting",
  description: "Football and basketball odds across the Premier League, Champions League, La Liga, Serie A, Bundesliga and NBA.",
  // iOS Safari would turn match IDs, odds and booking codes into tel:/mailto: links before React
  // loads, breaking hydration (and making an ID tappable to call it).
  formatDetection: { telephone: false, email: false, address: false, date: false },
};
export const viewport: Viewport = { themeColor: "#0B4A2A", width: "device-width", initialScale: 1 };

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The head script adds a splash class to <html> before hydration; that difference is expected.
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
        <noscript>
          <style>{"#kb-splash{display:none}"}</style>
        </noscript>
      </head>
      <body className="font-sans antialiased">
        <Splash />
        <AppShell
          minStakeGhs={minStakeGhs()}
          bonus={bonusRules()}
          footer={<Footer />}
          sidebar={
            <Suspense>
              <SideNavWithData />
            </Suspense>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
