# Brand: Bet Zone

## Name selection

An initial shortlist was generated and assessed for memorability, pronunciation (Ghana +
international) and distinctiveness from the reference:

| Name | Read | Note |
|---|---|---|
| Stakra | "stake" + suffix | coined, distinctive — the original working name |
| Baobet | baobab + bet | pan-African but "-bet" is crowded |
| Zuri Bet | Swahili "beautiful" | East-African connotation, off-market |
| Oddwin | odds + win | descriptive, weak as a trademark |
| Sankobet | Sankofa + bet | culturally strong but long and on-the-nose |

**Bet Zone** is the brand, chosen by the owner, replacing the working names *Kingz Bet* and
then *888SoccerBet*. It is short, easy to say and type, and reads instantly as a betting site.

### Clearance status (temporary brand) — ⚠️ check before launch

- "Bet Zone" / "Betzone" is a common construction, and betting businesses already trade under
  it in several markets. A full trademark and domain clearance is therefore essential and more
  likely to surface conflicts than for a coined name.
- No clearance search was run for this name here, and this is **not** legal clearance. A
  registered trademark search (USPTO/EUIPO + Ghana Registrar of Companies service-mark
  register) and domain registration are required before any launch. Until then Bet Zone is a
  **temporary/working brand**.
- Email and web addresses still use the old `888soccerbet.com` domain until a Bet Zone domain
  is chosen (`EMAIL_FROM`, `LEGAL_EMAIL`, `APP_URL` and the support links).

## Visual identity

**White and green**, taken from the supplied logo.

- **White mode is the default.** Page `#F7FAF8`, cards `#FFFFFF`, hairlines `#DFEBE3`, text
  `#0A1A10`. Actions use a deepened brand green `#15803D` (the logo green is too pale for text
  on white); odds and bonuses `#166534`.
- **Deep brand green** for the always-dark blocks (header, footer, tickets) and dark mode:
  page `#03140A`, surfaces `#061E0F`, with the logo's own green `#58F800` for actions.
- Emerald and red are reserved for win/loss; amber only for warnings.
- The **admin console** uses the same palette, white by default, with its own remembered
  white/dark toggle.
- Typography: **Sora** (display) + **Manrope** (body), tabular figures for money and odds.
- Logo: the supplied Bet Zone artwork, cut out of its black background
  (`public/img/brand/betzone-logo.png`), used in the header, admin sidebar, win pop-up and
  booking pop-up. A small inline-SVG mark (`BrandMark` in `src/components/Logo.tsx`) stands in
  where only a square icon fits.
- Icons: the browser-tab favicon (`src/app/icon.png`, `src/app/favicon.ico`) is the crown and
  "BET ZONE" on a dark rounded tile; the phone home-screen icon (`src/app/apple-icon.png`) is
  the full logo.

Tokens live in `tailwind.config.ts`; base styles and component classes in
`src/app/globals.css`.

## Brand voice

Direct, fast, trustworthy, never hype-y. Copy states facts ("Server-settled, fully
auditable") and always keeps the 18+/responsible-gaming message visible.

## Design direction

- **Hierarchy**: sticky top nav → hero → sport filter chips → match grid, with the
  betslip as a persistent right rail on desktop and a bottom-sheet on mobile (a different
  structure from the reference's left-rail/centre/right-slip composition).
- **Match card**: competition + time header, stacked teams with live score, a 2/3-up odds
  row, and a "N markets" link to the fixture page.
- **Odds button**: a quiet tile with the price in amber; filled amber when selected — big enough for thumbs.
- **Mobile-first**: single-column grid, bottom betslip FAB + drawer, 44px-plus tap
  targets, loading skeletons and explicit empty/error states throughout.
- **Accessibility**: semantic landmarks, `aria-pressed` odds buttons, labelled inputs,
  visible focus rings, `prefers-reduced-motion` honoured.
