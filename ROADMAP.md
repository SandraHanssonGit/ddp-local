# DPP v2 — Roadmap

Builds on the gaps identified in COMPLIANCE.md. Nothing here requires a
new data model — additive tables and columns on top of the existing
`styles` → `variants` → `gtins`, `batches` → `sgtins`,
`field_definitions` / `dpp_values` structure.

Branch: `dpp-v2-local` is the active development branch (contains the
September architecture plus this session's fixes). `dpp-v3-local` is a
snapshot of the same code, ready for whichever of these phases starts
next. `archive-gtin-aug2026*` branches hold the earlier, simpler
GTIN-only architecture for reference only.

## Priority order

| # | Phase | Why this position |
|---|---|---|
| 0 | Field administration gap (see below) | Blocks Phase 5 in practice — no point adding fields nobody can fill in |
| 1 | Versioning + supersede lock | Everything else writes through `dpp_values`; build the locking rule once, not per-phase |
| 2 | Locale (multi-language) | Nudie sells across the whole EU — not a future nice-to-have, a current gap |
| 3 | GS1 Digital Link routing | Cost of switching URL schemes only grows as more QR codes get printed |
| 4 | Economic operators | Isolated, low-risk, can land whenever |
| 5 | Expanded field definitions (SVHC/REACH, PEF, reparability, end-of-life) | Pure content once Phase 0 + 1 are in place |

---

## Phase 0 — Field administration gap

**Problem found this session:** field values can currently only be
viewed/edited through the admin UI at the **Style** level. Confirmed
by reading every admin route:
- `batch-detail.ejs`, `gtin-detail.ejs`, `sgtin-detail.ejs` have **no**
  `dpp_values` query or edit form at all, despite the backend
  (`services/override-service.js`, `routes/admin/overrides.js`) fully
  supporting overrides at any of the four levels.
- Even at Style level, the query starts from `dpp_values` (`JOIN`, not
  `LEFT JOIN`), so a brand-new `field_definitions` row with zero values
  anywhere **never appears** as an editable, empty field — it's
  invisible until a value already exists, which nothing lets you
  create.
- The "+ Add Field" form doesn't ask which levels
  (`editable_at_style` / `_batch` / `_gtin` / `_sgtin`) the field
  should apply to, and nothing downstream reads those columns anyway.

**Fix (design already proposed — see the "Nudie DPP Brand Redesign"
canvas, artboards "Add Field — level selector" and "Batch — DPP
Values"):**
1. Add a level-selector (checkboxes for Style/Batch/GTIN/SGTIN) to the
   "+ Add Field" form, writing to the existing `editable_at_*` columns.
2. Change the value-listing queries on all four detail pages to start
   from `field_definitions` (filtered by the relevant `editable_at_*`
   flag) `LEFT JOIN dpp_values`, so an unset field renders as an empty,
   fillable input instead of not rendering at all.
3. Add the missing `dpp_values` section + save handler to
   `batch-detail.ejs`, `gtin-detail.ejs`, `sgtin-detail.ejs`, mirroring
   the pattern already in `style-detail.ejs`.

## Phase 1 — Passport versioning + supersede lock

**New tables / columns:**
- `passport_versions` (`entity_type`, `entity_id`, `version_number`,
  `issued_at`, `change_type`, `change_note`, `superseded_by`)
- `dpp_values.superseded_by INTEGER NULL`
- `dpp_values.locked_at DATETIME NULL`

**Behavior:** once a batch is marked "produced" (production date
passed, or a manual flag), further writes to that batch's — or its
SGTINs' — `dpp_values` do not `UPDATE` the row. They insert a new row
and set `superseded_by` on the old one, preserving the original as a
historical record. `services/passport-resolver.js` queries add
`WHERE superseded_by IS NULL`.

Agreed tradeoff: soft lock with supersede, not a hard read-only block —
lets you correct a mistake (e.g. batch actually produced in France, not
Tunisia) without losing the original value or allowing silent
overwrites.

## Phase 2 — Locale

**New column:** `dpp_values.locale TEXT NULL` (`NULL` = default /
language-independent, e.g. numeric values).

**Resolver behavior:** `passport-resolver.js` takes a `locale`
parameter; falls back to English when a translation for the requested
locale is missing (agreed: English fallback, not a hard block on
publishing until every language is translated).

## Phase 3 — GS1 Digital Link routing

Port `/01/:gtin_14/21/:serial` from the archived
`archive-gtin-aug2026` branch, rewritten against the v2 schema
(`sgtins` / `gtins`, not v1's `serials` table). Make this the canonical
public URL (what QR codes point to); keep `/dpp/:batch/:gtin/:sgtin` as
an internal/admin convenience link.

## Phase 4 — Economic operators

**New table:** `economic_operators` (`role`, `legal_name`, `address`,
`country`, `registration_number`).
**New columns:** `styles.operator_id`, `batches.operator_id` (both
nullable — a batch without one inherits the style's operator). Simple
CRUD screen in the admin hub; shown on the public passport.

## Phase 5 — Expanded field definitions

New `field_definitions.category` values: `svhc_reach`,
`environmental_pef`, `reparability`, `end_of_life`. Candidate fields
(placeholder — pending the delegated act's final annex, see
COMPLIANCE.md open questions):
- `hazardous_substances_declaration` (SVHC/REACH)
- `carbon_footprint`, `water_usage` (PEF)
- `repairability_score`, `spare_parts_availability` (reparability)
- `recycling_instructions`, `takeback_program` (end-of-life)

## Separately tracked (not phased — do independently)

- **Enforce `consumer_visible` on the live public passport page.**
  `routes/dpp.js` currently ignores it; the new JSON export endpoint
  (`GET /dpp/:batch/:gtin/:sgtin/json`) already filters correctly and
  is the reference implementation to copy into `dpp-passport.ejs`'s
  rendering path.
- **Role-based / authority access.** Deliberately not a public
  self-service toggle (see COMPLIANCE.md gap 7) — needs its own
  authenticated path, design not yet started.
- **Visual redesign.** In progress as a design proposal only — see
  DESIGN_SYSTEM.md. Not blocking any phase above; can land whenever
  the team is ready to implement it in code.

## Known bugs found during this work (fix opportunistically)

- `repositories/sgtins.js`'s `create()` method omits `batch_id` from
  its `INSERT`, despite the column being `NOT NULL` in the schema — it
  would throw if ever called. No route currently calls it (SGTINs are
  created via direct SQL in this session's test-data scripts, not
  through this repository method), so it's latent, not yet triggered
  in production use.
