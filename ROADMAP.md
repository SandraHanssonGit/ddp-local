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

**Phases 0–3 and the Variant architecture fix are done** (2026-09-16).
Updated priority order for what's left, decided 2026-09-16:

| # | Item | Why this position |
|---|---|---|
| 1 | DPP Fields tab: Levels column + Edit/Delete (see below) | Small, contained, and the last missing piece for admins to manage what's already built (Phase 0 + Variant) before moving to net-new scope |
| 2 | Visual redesign in code | Design is approved (see DESIGN_SYSTEM.md); implementation hasn't started - admin pages and the consumer passport still use the old generic styling |
| 3 | Phase 4 — Economic operators | Isolated, low-risk |
| 4 | Phase 5 — Expanded field definitions | Pure content |
| 5 | Auth-hardening the v2 admin API | Larger, separate task (see security note below) |
| 6 | Known low-priority bugs (unreachable scan-form route, `passports.js`'s missing method) | Edge-case/unused paths |

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

## Phase 3 — GS1 Digital Link routing ✅ Done (2026-09-16)

Not ported from the archived branch as originally planned - written
fresh against the v2 schema, which turned out simpler than expected:
`sgtins` already has `UNIQUE(gtin_id, serial_number)`, so a GTIN +
serial number alone uniquely identify an SGTIN with no batch needed in
the URL at all.

**Before writing any route code**, mapped every place in the admin UI
that builds a passport URL (per explicit ask, to avoid discovering UI
gaps mid-build again): `hub-v2.ejs`'s SGTINs tab, `sgtin-detail.ejs`'s
quick-link button and sidebar URL card, `style-detail.ejs`'s example
text. All four updated to show `/01/{gtin}/21/{serial}` as primary;
`sgtin-detail.ejs` also keeps the legacy URL visible as a secondary
"still works internally" link.

**Shared rendering, not duplicated**: new `services/passport-page-service.js`
holds the scan-logging + resolve + render logic once;
`routes/dpp.js` (legacy) and the new `routes/gs1.js` both call it. This
was the specific risk flagged before starting - scan tracking, `?lang=`,
and the JSON export could easily have been wired into one route and
forgotten on the other. Verified they didn't drift: locale-aware JSON
resolves identically on both URLs, and a scan on the GS1 URL increments
the same `scan_events` count as the legacy one (checked with a real
before/after count, not just "it returns 200").

`routes/gs1.js` mounted at root (`/01/:gtin/21/:serial[/json]`), not
under `/dpp`, since GS1 Digital Link URIs aren't prefixed.

**Known pre-existing issue, not touched**: `/dpp/:batch/:gtin/scan`
(the lazy-SGTIN-creation scan form) is unreachable - Express matches
`/:batch/:gtin/:sgtin` first (registered earlier in the same file), so
a request to `.../scan` matches that route with `sgtin="scan"` instead
of ever reaching the scan-form route. This existed before Phase 3 (same
registration order preserved) and is separate from this SGTIN feature
being incomplete anyway (missing `dpp-scan-form.ejs`, found earlier
this session).

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

- **DPP Fields tab has no edit/delete UI, and no Levels column** ⏭
  Next up. `/admin-v2?tab=fields` only lists field definitions and lets
  you create new ones. The backend (`PUT /api/admin/fields/:fieldId`)
  already supports editing a field's metadata, but nothing in the UI
  calls it — there's no Edit or Delete action per row, and the list
  doesn't show which levels (`editable_at_style`/`_variant`/`_batch`/
  `_gtin`/`_sgtin`) a field actually applies to (that's only visible in
  the create form, not afterward). More pressing now that Variant is a
  real fifth level — five levels to track per field, invisible after
  creation. Prioritized ahead of Phase 4/5 and the visual redesign:
  small and contained, and it's the last missing piece for admins to
  actually manage what Phase 0 and the Variant fix already built,
  rather than moving on to net-new scope with this loose end open.
- ~~**Variant is missing as a DPP value level entirely.**~~ ✅ Done -
  see "Variant architecture fix" section above.

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

## Variant architecture fix ✅ Done (2026-09-16)

**Finding, confirmed against real product data**: for product types
like tops, the *product name itself* differs per variant (e.g. "Raw
Hem T-Shirt Black" vs "Raw Hem T-Shirt Navy"), not just the size run.
The schema didn't support this - `variants` only carried a code/label
(`variant_name`); `product_name` and `image_url` lived solely on
`styles`, shared identically across every variant. Confirmed in the
schema: `styles.style_number` is `UNIQUE` on its own (not composite
with variant), and `variants` had no content columns at all.

**Fix:**
- `variants.product_name` / `variants.image_url` added (both `NULL` =
  falls back to the parent style's - most products, like jeans without
  real variants, need no change).
- `variant` added as a full DPP value level, joining
  style/batch/gtin/sgtin - new `editable_at_variant` column on
  `field_definitions`, `variant` added to the valid entity types in
  `field-service.js` and `override-service.js`.
- Resolution precedence, per explicit decision: **SGTIN > GTIN > Batch
  > Variant > Style**. Verified with real overrides: a GTIN-level value
  beat a Variant-level one, and the existing Batch-level
  `country_of_origin` override still beat Variant, exactly as decided.
- New `repositories/variants.js`; `variant-detail.ejs` gained a working
  edit form (the old one called a `PATCH /api/admin/variants/:id`
  endpoint that never existed - fixed to hit the real route) plus a DPP
  Fields card and language tabs, matching the other three levels.
- GTIN and SGTIN detail pages' "inherited from" logic now checks
  Variant between Batch and Style/GTIN respectively.

**Bug fixed in passing**: `resolveGtinPassport()` read a
`gtin.batch_id` that doesn't exist in the schema (a GTIN can appear in
several batches via `batch_gtins`, so there's no single "the batch" for
a GTIN alone) - this method always threw before being called. Fixed by
dropping Batch from the GTIN-only resolution chain (now GTIN > Variant
> Style) while adding Variant support in the same edit.

**Known bug found, not fixed (unrelated, pre-existing)**:
`routes/admin/passports.js`'s `GET /gtin/:gtinId` route calls
`passportResolver.getResolvedValuesByCategory()`, which has never
existed on `PassportResolver`. Confirmed via testing - the route now
gets past the batch_id bug above and fails on this next, separate one.
Out of scope for the variant fix; flagged here for whoever picks up
`routes/admin/passports.js`.

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
