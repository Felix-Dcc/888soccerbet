# Brand: Kingz Bet

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

**Kingz Bet** was chosen as the final brand by stakeholder decision. It is confident and
regal, trivially pronounceable in Ghana and internationally, and reads instantly as a
betting brand.

### Clearance status (temporary brand) — ⚠️ conflict risk

- Unlike a coined name, **"Kingz Bet" is a common betting-brand construction** ("King
  Bet", "Kingbet", "Kingz Bet" exist in several markets). A **full trademark and domain
  clearance is therefore essential and more likely to surface conflicts** than for a
  coined name. No clearance search was run for this specific name here.
- This is **not** legal clearance. A registered trademark search (USPTO/EUIPO + Ghana
  Registrar of Companies service-mark register) and domain registration are required
  before any launch. Until then Kingz Bet is a **temporary/working brand**.

## Visual identity (deliberately unlike the reference)

The reference uses royal blue + gold with a light UI. Kingz Bet is the opposite end of the
spectrum — a **dark "sport-tech"** identity:

- **Ink** base `#0B0F14` with elevated surfaces `#141A22` / `#1B232E`.
- **Electric lime** accent `#C6F24E` (energy, the "go" of a live price).
- **Teal** `#16D1B4` for wins/positive signals; **coral** `#FF5A5F` for loss/danger.
- Typography: **Sora** (display, geometric, confident) + **Manrope** (body, highly
  legible at small sizes on phones).
- Logo: a lime rounded-square containing an original crown/chevron mark, with a
  `Kingz`+lime`Bet` wordmark. Defined in `src/components/Logo.tsx` (inline SVG, no raster
  asset copied from anywhere).

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
- **Odds button**: compact, label-over-price, lime when selected — big enough for thumbs.
- **Mobile-first**: single-column grid, bottom betslip FAB + drawer, 44px-plus tap
  targets, loading skeletons and explicit empty/error states throughout.
- **Accessibility**: semantic landmarks, `aria-pressed` odds buttons, labelled inputs,
  visible focus rings, `prefers-reduced-motion` honoured.
