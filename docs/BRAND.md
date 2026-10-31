# Brand: 888SoccerBet

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

**888SoccerBet** was chosen as the final brand by the owner, replacing the earlier working
name *Kingz Bet*. It names the sport and the product plainly and is easy to say and type.

### Clearance status (temporary brand) — ⚠️ high conflict risk

- **"888" is an established gambling trademark.** 888 Holdings plc runs 888sport,
  888casino and 888poker and holds registered marks across many jurisdictions. A betting
  brand opening with "888" is therefore **substantially more likely to attract an
  opposition or infringement claim** than a coined name. Treat this as the primary brand
  risk, ahead of everything else in this document.
- No clearance search was run for this name here, and this is **not** legal clearance. A
  registered trademark search (USPTO/EUIPO + Ghana Registrar of Companies service-mark
  register) and domain registration are required before any launch. Until then
  888SoccerBet is a **temporary/working brand**.

## Visual identity

A restrained **dark** identity. One accent carries actions; colour is never decorative.

- **Base** `#0B1220`, surfaces `#111B2E`, raised `#18253D`, hairline borders `#24334F`.
- **Text** `#E8EDF5`, muted `#8E9BB3`.
- **Amber** `#F0A53A` is the single accent: primary actions, odds and bonuses.
- **Green** `#2EA66F` and **red** `#D9534F` are reserved strictly for win/loss and status.
- Surfaces are separated by lightness steps and 1px borders — no gradients, no glow.
- The **admin console** is scoped to its own palette (muted indigo `#5C7CFA` dark /
  `#3B5BDB` light) with a remembered light/dark toggle, so staff tools never read as the
  player site.
- Typography: **Sora** (display) + **Manrope** (body), tabular figures for money and odds.
- Logo: a dark rounded tile holding a **gold crown over a football**, beside a
  `888SOCCER` + green `BET` wordmark. Inline SVG in `src/components/Logo.tsx` and
  `src/app/icon.svg` — no raster asset copied from anywhere.

> **Open point:** the supplied logo uses a vivid green (`#3CDC3C`) while the product UI
> runs on amber. The logo currently keeps its own green; switching the site accent to
> green is a one-token change in `src/app/globals.css` if that is preferred.

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
