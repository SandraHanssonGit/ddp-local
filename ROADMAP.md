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

## Phase 0 — Field administration gap ✅ Done (2026-09-16)

Built and tested end-to-end: a field set at any of the four levels
(Style/Batch/GTIN/SGTIN) now correctly appears in the public JSON
export with the right `source`. Verified with real data — GTIN
`5711814031273` / batch `PO45001234` / serial `0001`:
`fiber_composition` from style, `country_of_origin` overridden at
batch (Tunisia → France, the exact scenario discussed while designing
this), `care_instructions` from GTIN, `repair_program` from SGTIN.

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
4. **Full inherited-value display** (upgraded 2026-09-16 to match the
   canvas mockup): GTIN and SGTIN show three states per field —
   "Overridden here" (with the inherited value shown for comparison,
   and a Clear-override action), "Inherited" (grey, read-only), and
   "Not set yet" (amber). **Batch deliberately only gets two states**
   (Set / Not set, no inherited comparison) — a batch can span several
   styles (verified concretely: batch `PO45001234` in this dataset
   contains GTINs from 4 different styles), so there is no single
   valid "inherited from Style" value to show. This is a considered
   deviation from the canvas mockup, not an oversight — see
   `views/admin/batch-detail.ejs`'s in-page note explaining why.
   "Clear override" reuses the existing generic
   `DELETE /api/admin/overrides/:entityType/:entityId/field/:fieldKey`
   endpoint (which also gets audit logging via `audit-service.js` for
   free — the new Save routes don't log audit entries, only overrides
   does).

## Phase 1 — Passport versioning + production lock ✅ Done (2026-09-16)

**Plan corrected during implementation**: the original idea of a
`dpp_values.superseded_by` chain (multiple rows per field+entity) does
not work — `dpp_values` already has
`UNIQUE(field_definition_id, entity_type, entity_id)`, so more than one
row per field+entity is not possible without rebuilding that
constraint. Built instead on infrastructure that already existed:

**New tables / columns actually added:**
- `passport_versions` (`entity_type`, `entity_id`, `version_number`,
  `issued_at`, `change_type`, `change_note`, `superseded_by`) — new
  table, no conflict, used exactly as planned.
- `batches.produced_at DATETIME NULL` — manual lock trigger (a "Mark as
  Produced" button, not automatic from `production_date`, per explicit
  decision).
- `dpp_values.locked_at DATETIME NULL` — stamped on the current row
  when it's written while its batch is already produced. Purely
  informational for the UI (shows the 🔒 banner); it does not gate
  reads.

**Behavior actually implemented:** `services/field-service.js`'s
`setValue()` (the single write path used by every Phase 0 save route)
now: (1) always diffs against the current value and logs to
`field_change_log` via `audit-service.js` when it changed — this was a
pre-existing gap (Phase 0's routes never logged at all, only
`override-service.js` did); (2) stamps `locked_at` on the row if
`isEntityLocked()` says the batch (or the SGTIN's batch) is produced.
History of a locked value lives in `field_change_log`, not in a second
`dpp_values` row — `passport-resolver.js` needed **zero changes**,
since there's still exactly one row per field+entity.

**Passport versioning**, scoped per explicit decision to direct SGTIN
writes only (no cascade from Style/Batch/GTIN changes) —
`repositories/passport-versions.js` bumps a version row each time an
SGTIN's own field value actually changes.

**UI:** "Mark as Produced" button + lock banner on `batch-detail.ejs`;
matching read-only lock banner + a new "Passport Version History"
panel on `sgtin-detail.ejs`.

Verified end-to-end: marked a batch produced, edited a locked SGTIN's
field, confirmed the old value landed in `field_change_log`
(`action: 'created'`/`'updated'`) and the current row got `locked_at`
stamped; edited a GTIN-level field on the same chain and confirmed the
SGTIN's passport version did **not** bump (scope working as decided);
confirmed the public `/dpp/.../json` export is unaffected.

## Phase 2 — Locale ✅ Done (2026-09-16)

**Schema:** `dpp_values` rebuilt (SQLite can't `ALTER` a `UNIQUE`
constraint) with `locale TEXT NULL` added to
`UNIQUE(field_definition_id, entity_type, entity_id, locale)`.
`locale = NULL` = the default/fallback value - all pre-Phase-2 data
became "default" automatically, no content migration needed. Rebuild
is guarded (checks for the column first) and was verified to preserve
every row, including `locked_at` timestamps, before being run for
real.

**Resolution: language-first, then level** (per explicit decision).
`passport-resolver.js` searches every level (SGTIN > GTIN > Batch >
Style) for a value in the requested locale first; only if **no** level
has one does it fall back to the same level order in the default
locale. Verified with a real conflict: a French translation set at
**Style** (lowest precedence) correctly won over an English override
set directly on the **SGTIN** (highest precedence) when a French
passport was requested - and the English SGTIN value still won when no
language was requested, confirming no regression to the pre-Phase-2
behavior.

**Scope, per explicit decision:** infrastructure only - no actual
translations were entered as real content. English (i.e. whatever's in
the default/NULL row today) is the fallback everywhere.

**Where it's wired in:**
- `?lang=` query param on the public passport HTML page and the JSON
  export (`/dpp/:batch/:gtin/:sgtin[/json]?lang=fr-FR`)
- A language tab bar (Default + every locale with content + a free-text
  "add a locale" box) on all four admin detail pages (Style, Batch,
  GTIN, SGTIN) - reads via `?lang=` on the page itself, writes via the
  same query param on the save/clear-override calls
- `services/override-service.js`'s `setOverride`/`removeOverride` also
  became locale-aware (they write through the same `dpp_values` table)
  - a Style-level field, however, has no "override" concept at all
    (existing, unrelated rule - only batch/gtin/sgtin allow overrides),
    so a locale-tagged Style value is edited via the normal save form,
    not cleared via the override endpoint.

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

- **DPP Fields tab has no edit/delete UI.** `/admin-v2?tab=fields`
  only lists field definitions and lets you create new ones. The
  backend (`PUT /api/admin/fields/:fieldId`) already supports editing
  a field's metadata, but nothing in the UI calls it — there's no
  Edit or Delete action per row, and the list doesn't show which
  levels (`editable_at_style`/`_batch`/`_gtin`/`_sgtin`) a field
  actually applies to (that's only visible in the create form, not
  afterward).
- **Variant is missing as a DPP value level entirely.** The product
  hierarchy is Style → Variant → GTIN, but `field-service.js`'s valid
  entity types are only `style`, `batch`, `gtin`, `sgtin` — `variant`
  isn't one of them. Per feedback: most fields (care instructions,
  sustainability info, etc.) shouldn't need to be set per individual
  GTIN (which is size-level granularity) - they should be settable
  once at Style level, or once per Variant when a style has variants
  (color/fit-level), not repeated across every size's GTIN. Fixing
  this means: adding `variant` to the valid entity types across
  `field-service.js`/`fieldRepository`/`override-service.js`, adding
  it to the resolution precedence in `passport-resolver.js` (likely
  SGTIN > GTIN > Variant > Batch > Style, batch's position relative to
  variant still needs deciding), a `getFieldsForLevel`-style admin UI
  for it, and an `editable_at_variant` column on `field_definitions`.
  This is a real hierarchy change, not just a UI fix - worth scoping
  as its own small phase rather than folding into the Fields-tab fix
  above.

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

## Security note (found while building Phase 0, 2026-09-16)

The entire v2 admin API (`routes/admin/styles.js`, `fields.js`,
`overrides.js`, `hub-v2.js`, and now the new Phase 0 batch/gtin/sgtin
dpp-values routes) has **no authentication at all** —
`routes/admin/hub-v2.js` even has a `// no auth for development`
comment. Decided explicitly: new Phase 0 routes match this existing
pattern rather than being selectively hardened, since protecting three
routes while the rest of the admin API stays open would be a false
sense of security. **Auth-hardening the whole v2 admin API is its own
separate task, not yet scheduled.**

## Known bugs found during this work (fix opportunistically)

- `repositories/sgtins.js`'s `create()` method omits `batch_id` from
  its `INSERT`, despite the column being `NOT NULL` in the schema — it
  would throw if ever called. No route currently calls it (SGTINs are
  created via direct SQL in this session's test-data scripts, not
  through this repository method), so it's latent, not yet triggered
  in production use.
