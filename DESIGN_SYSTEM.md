# DPP v2 — Visual Design System (proposal)

Status: **consumer passport implemented in code** (`views/dpp-passport.ejs`,
2026-09-16) - light/dark toggle, responsive at phone width, real
language switcher wired to actual available locales.

**Admin redesign in progress** (`public/css/admin.css`, 2026-09-16):
a shared stylesheet implementing the light-mode tokens/components
below (nav, card, table, badge, button, input, level pills, lock
banner) replaces the Tailwind-CDN utility markup page by page. Light
mode only, no mobile layout - internal desk tool, per "Responsive"
below. Done: `views/admin/hub-v2.ejs` (Styles/Variants/GTINs/Batches/
SGTINs/Fields/Analytics tabs) and all 5 detail pages (style-detail,
variant-detail, batch-detail, gtin-detail, sgtin-detail). Not yet done:
field-form, import.

Live mockups: [Nudie DPP Brand Redesign](https://claude.ai/artifact/54jb72xppoKyoV7fQAUNzj)
— a multi-artboard canvas covering the consumer passport (light + dark
mode), the admin hub Styles tab, the field editor (with the Phase 1
version-history / lock UI), and the Phase 0 field-administration fix
(level selector + Batch DPP Values view).

## Brand grounding

Built from Nudie Jeans' actual site (nudiejeans.com product pages, the
"This is Nudie Jeans" hero, and the transparency/CO2 panel) — not a
generic aesthetic. The real logo (`public/nudie-logo.png`) is used
throughout, cropped to the wordmark itself (the source file is a
600×600 square with the mark occupying roughly x:30–569, y:262–336 —
crop to that box rather than scaling the full square, or the wordmark
renders illegibly small).

## Color

Exactly two scales — light and dark — no third "brand" palette layered
on top.

**Light**
| Token | Value | Use |
|---|---|---|
| `--bg` | `#f2f0ea` | Page background |
| `--surface` | `#faf8f3` | Cards, pills, inputs |
| `--surface-2` | `#ece7db` | Secondary fill (badges) |
| `--text` | `#1c1b18` | Primary text |
| `--muted` | `#726f66` | Secondary text, captions |
| `--hairline` | `#ddd8ca` | Dividers, borders |
| `--accent` | `#2f4d78` | Denim-blue accent, links, primary actions |
| `--accent-soft` | `#e7ecf2` | Accent-tinted background (selected state, overridden-field badge) |

**Dark**
| Token | Value | Use |
|---|---|---|
| `--bg` | `#171613` | Page background |
| `--surface` | `#201f1b` | Cards, pills, inputs |
| `--surface-2` | `#2a2823` | Secondary fill |
| `--text` | `#f1efe8` | Primary text |
| `--muted` | `#9c988e` | Secondary text |
| `--hairline` | `#37342d` | Dividers, borders |
| `--accent` | `#7f9dc9` | Brightened denim-blue for contrast on dark |
| `--accent-soft` | `#26344a` | Accent-tinted background |

**Status colors** (used sparingly — lock/warning banners, not
saturated alert red/green):
| Token | Value | Use |
|---|---|---|
| `--warn-bg` / `--lock-bg` | `#f3ead8` | Production-lock banner background |
| `--warn-text` / `--lock-text` | `#7a5a20` | Production-lock banner text |
| `--warn-border` / `--lock-border` | `#e3d3ac` | Production-lock banner border |

No dedicated dark-mode status colors were designed yet for the
lock/warning banner — needed before the field editor ships in dark
mode.

## Typography

- **Headlines:** Archivo (Google Fonts), 500–700 weight
- **Body / UI:** Work Sans (Google Fonts), 400–600 weight
- **Small caps / labels:** Work Sans, 11px, `letter-spacing: 0.14em`,
  uppercase, 600 weight, `--muted` color
- Both are Google Fonts loaded via `<link>` — no local font files
  needed. Neither is the brand's actual proprietary typeface (unknown);
  these were chosen as a close editorial-grotesk match. Revisit if
  Nudie has an actual brand type license to point to instead.

## Icons

Lucide-style: stroke-based, 24×24 viewBox, 1.7–1.8px stroke width,
round line caps/joins, no fills. **Drawn as inline SVG, not loaded from
Lucide's CDN** — the design-canvas sandbox this proposal was built in
has no external script/network access beyond Google Fonts, so icons
were hand-traced to match Lucide's visual style rather than imported.
When this ships in the real app (which does have normal network
access), switch to the actual `lucide` npm package or CDN script rather
than continuing to hand-draw SVGs.

## Navigation

Plain text links, underline-on-active, no button chrome — modeled on
kritiker.se's minimal nav pattern rather than a typical SaaS admin's
pill-button tabs. Applies to both the admin hub's tab bar and the
consumer passport's top nav.

## Dark mode

Deliberately not literal photography in the dark hero (avoids
reproducing Nudie's actual marketing photo asset) — instead a subtle
textured gradient (`radial-gradient` + a faint diagonal repeating
pattern) evokes the same moody, concrete tone without copying a
specific image.

## Responsive

Mobile-width (390px) versions of the consumer passport exist for both
light and dark mode ("Consumer passport — light/dark (mobile)" on the
canvas). Adjustments made for the smaller viewport:
- Top nav collapses to logo + menu icon — the kritiker.se-style text
  links don't fit at 390px and would need a drawer/sheet pattern (not
  designed yet — the icon is a placeholder for that interaction)
- Stat pills (CO₂/water) stack vertically instead of sitting side by
  side
- Headline drops from 40px to 26px; section padding tightens from
  56px to 20px
- Supply-chain steps go single-column with smaller type; content is
  unchanged from desktop

The admin hub was **not** given a mobile layout — it's an internal
tool used from a desk, and mobile was prioritized for the consumer
passport specifically, per explicit direction (most scans happen on a
phone). Revisit if that assumption turns out wrong.

## Open items

- **Mobile nav interaction undesigned.** The mobile passport's menu
  icon has no defined behavior yet — needs a drawer/sheet design
  before this ships.
- No interaction/motion spec yet (hover states, transitions) — the
  mockups are static.
- No dark-mode status colors for warning/lock banners (see above).
- Component-level implementation plan (which EJS partials change,
  whether Tailwind config needs new tokens) not yet written — this
  document covers the visual decisions, not the migration plan.

## Resolved open questions

- Field list/thresholds for the textile delegated act (COMPLIANCE.md):
  not blocking — fields are added incrementally as the dynamic field
  system already supports this without migration.
- Compliance deadline and brand typeface license: no information
  available yet; proceeding with Archivo/Work Sans as the working
  choice until a licensed brand typeface is provided.
