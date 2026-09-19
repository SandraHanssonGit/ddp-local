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
| 1 | ~~DPP Fields tab: Levels column + Edit/Delete~~ | ✅ Done (2026-09-16) - see below |
| 2 | Visual redesign in code — **done** (2026-09-16): consumer passport, DPP Hub, all 5 detail pages, login, confirm/alert modal. `import.ejs` still old Tailwind layout (not linked from the hub nav; left as-is). `/admin-config` (field-form/config-dashboard) turned out to be an abandoned parallel field-CRUD system duplicating the Fields tab - deleted rather than redesigned. | Design is approved (see DESIGN_SYSTEM.md) |
| 3 | ~~Phase 4 — Economic operators~~ | ✅ Done (2026-09-16) - see below |
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

## Configurable GS1 hierarchy per product type — Phase 1 ✅ Done, Phases 2-5 not built (design 2026-09-17/19)

**Problem**: not every product needs the full serialized
Style→Batch→GTIN→SGTIN chain. Some product types will never have
individual garment tracking (e.g. simple accessories produced in bulk)
and shouldn't be forced through SGTIN creation; others may not need
Batch-level overrides to matter for their passport at all.

**Design, confirmed with the user across several rounds of questions**:
three GS1 schemes, configurable per product type (global only — no
per-Style/Batch override, confirmed):
- `batch_gtin_sgtin` — full hierarchy, individual serialized units.
  Today's only actual behavior; the default for every existing
  product type.
- `batch_gtin` — no individual units exist at all for that product
  type. One code per **Batch+GTIN combination**, not just per GTIN —
  confirmed explicitly because the same GTIN can be produced across
  multiple batches with different override values, so a GTIN-only code
  couldn't say which batch's data to show.
- `gtin_sgtin` — individual units still exist and are still
  serialized, but Batch doesn't participate in that product's
  inheritance/identity at all (assumption, not yet re-confirmed: this
  affects resolution precedence, not just the printed code — worth a
  quick check with the user before Phase 2 locks it in).

Lifecycle events/scan tracking: confirmed to only matter for schemes
that have SGTIN (`batch_gtin_sgtin`, `gtin_sgtin`) — no new
event model needed for `batch_gtin`, since without a unit there's
nothing to track per-garment.

**Phase 1 (done, 2026-09-19)** — data model + admin config UI:
- `product_types` table (`key`, `label`, `gs1_scheme`), kept separate
  from the pre-existing `styles.product_type` free-text column (still
  used by the unrelated `product-type-config.js` size-format logic).
- `styles.product_type_id` FK, backfilled from existing `product_type`
  text values via `migrateProductTypes()` in `db/init-v2.js` — every
  existing style defaults to `batch_gtin_sgtin` (today's real
  behavior).
- Settings > Product Types sub-tab: list/add product types, change a
  type's scheme inline. `repositories/product-types.js`.
- Style detail page's Product Type field is now a dropdown of Product
  Types instead of free text.

**Not built yet — Phases 2-5**:
- **Phase 2 — Resolver**: new `resolveBatchGtinPassport(batchId,
  gtinId)` in `passport-resolver.js` (Batch → GTIN → Variant → Style,
  no SGTIN layer); a "skip Batch layer" branch in `resolveSgtinPassport`
  for the `gtin_sgtin` scheme.
- **Phase 3 — Public routes**: new `GET /01/:gtin/10/:lot` in
  `routes/gs1.js` for the `batch_gtin` scheme (lot = the existing
  `batches.batch_id`, confirmed — no new lot field needed), wired to a
  new render path in `passport-page-service.js`. Existing
  `/01/:gtin/21/:serial` stays as-is for the other two schemes.
- **Phase 4 — Admin UI ripple**: GTIN detail page needs to show its own
  QR/link when its style's scheme is `batch_gtin` (no SGTIN to link
  from). The Batch detail page's "QR Codes per GTIN" table (see etapp
  42/43 in CHANGELOG.md) needs a `batch_gtin`-scheme branch — "Units
  Shipped"/"Code Activated" as built are per-individual-unit counts,
  which don't apply when no units exist; that scheme needs a single
  activated/not-activated status per Batch+GTIN row instead.
- **Phase 5 — Scan tracking for `batch_gtin`**: nullable
  `batch_gtin_id` column on `scan_events` so page-view scans can be
  logged/aggregated per Batch+GTIN pair when there's no SGTIN to
  attach to.

## Freeze-at-production for master data changes (not built - design only, 2026-09-17)

**Problem**: Nudie will produce the same Style across many Batches
over time (sometimes years apart). Style/Variant-level `dpp_values`
never lock (only Batch/SGTIN do - see Phase 1 below), so editing a
Style's value today - say, a supplier or `country_of_origin` change -
immediately changes the *resolved* passport for every already-produced
Batch that doesn't have its own override too, since resolution is
always computed live against current data, not "as it was when that
Batch was made." User: "Om man tillåter ändringar av masterdatan efter
en produktion så måste det som redan producerats få ha kvar det gamla
värdet ... Vi måste ju bevisa att informationen är låst."

**Design landed on** (not yet built): **freeze-at-production**,
extending the existing "Mark as Produced" action rather than adding a
new mechanism:
- Rejected first: a time-versioned `dpp_values` (multiple rows per
  field with `valid_from`/`valid_until`) - same class of change
  already rejected once this session (see Phase 1's history below -
  `UNIQUE(field_definition_id, entity_type, entity_id, locale)` makes
  multi-row-per-field genuinely hard, which is exactly why
  `field_change_log` exists as the history mechanism instead of a
  supersede-chain in `dpp_values` itself).
- Instead: when a Batch is marked as produced, for every Style/Variant
  combination actually present in it (already known via
  `batch_gtins`), and for every field with `editable_at_batch = 1`,
  resolve **today's** effective value (Variant/Style, ignoring Batch)
  and - only where no Batch/Batch×Style value is already explicitly
  set - write it explicitly at the Batch×Style level (reusing
  `batch_style_scopes`, see above), stamped `locked_at` immediately.
- Why this proves lock: after freezing, that Batch's units resolve
  against an explicit, locked `dpp_values` row at `Batch×Style` -
  which already outranks plain `Style` in the resolution precedence
  (`SGTIN > GTIN > Batch×Variant > Batch×Style > Batch > Variant >
  Style`) - so a later Style edit cannot affect it. Any subsequent
  write to the frozen value is still logged in `field_change_log`
  (old value, new value, timestamp) - that log entry is the audit
  proof if someone did override the frozen record anyway.
- No new tables or schema needed - reuses `batch_style_scopes` and
  `dpp_values` exactly as they already work; only "Mark as Produced"
  needs new logic to perform the snapshot instead of just flipping
  `produced_at`.

User asked to pause here to focus on Batch work directly before
building this - captured so the decision isn't re-litigated later.

**Reconfirmed and refined (2026-09-19), still not built**:
- **Two milestones, one already existing, one just a relabeling**:
  "Batch sent for production" = the moment the Batch is created
  (`batches.created_at` already captures this - no new column).
  "Production date" = today's `produced_at` / "Mark as Produced" - the
  actual lock trigger. No schema change, just make both dates visible
  together in the UI (the Status stat card added in etapp 42 could show
  both instead of/alongside the Under development/Completed badge).
- **SGTIN-level locking already correct as-is**: "SGTIN only lock the
  SGTIN field" - confirmed this already matches Phase 1's behavior
  (`dpp_values.locked_at` is scoped per entity level already); no
  change needed here, freeze-at-production only adds the Batch×Style
  snapshot step above it.
- **Lifecycle data intentionally excluded from the freeze**: downstream
  lifecycle events (Viewed/Sold/Repaired/...) are Nudie-specific,
  expected to keep evolving after production - confirmed they should
  NOT be touched by the lock. Already true structurally (`lifecycle_events`
  is a separate, always-appendable table `dpp_values`/the freeze never
  touches) - no change needed.
- **Real gap found**: `field_change_log.reason` already exists in the
  schema (CLAUDE.md §13), and `audit-service.js` already records it
  when passed - but no edit form in the admin UI actually has a reason
  input. Editing a field after lock captures old/new value + who/when
  automatically, but never asks why. Worth adding a "reason (optional)"
  text input to the field-edit UI wherever a locked value can still be
  overridden (`batch-detail.ejs`'s DPP Field Values edit mode, and
  wherever GTIN/SGTIN-level fields are edited).

## Style/Variant "recipe" flexibility - confirmed no change needed (2026-09-19)

Discussion: does a Style even matter once a Style has Variants, or
should all data move to Variant level? Resolved: Style must always
exist regardless of Variants - GTINs always reference a Style
directly (`gtins.style_id`, kept even when `variant_id` is also set,
for referential integrity/simple joins), and genuinely shared fields
(base fiber composition, sustainability program) would otherwise have
to be duplicated across every variant, which Rule 5 explicitly forbids.

Separately: user noted a Variant may in practice hold "the whole
recipe" (e.g. a wash/treatment formula) as many explicit fields, with
little or no inheritance from Style actually happening for that field
category. Confirmed this needs no schema change - the existing
`dpp_values` per-field system already allows any level to hold as many
or as few explicit values as reality requires. A Style ending up with
few or no explicit values of its own (because a particular product's
variants all fully specify their own recipe) is not a modeling flaw;
Style still anchors the hierarchy and remains the fallback for
whatever genuinely is shared.

No "bundled recipe" entity (a named preset distinct from individual
`dpp_values` rows) was pursued - decided the flexible per-field system
is preferable to a more rigid structured concept here.

## Field source/provenance + pre-production preview (idea only, not designed, 2026-09-19)

Raised alongside the freeze-at-production discussion but is a
different concern - not part of that work:

**Idea**: much of a product's master data may eventually come from
other systems (M3/PIM) rather than being entered manually here. User
wants to be able to *declare*, per field, which system a value is
expected to come from - even before any Batch (or any value at all)
exists - and to preview what an unproduced product's passport would
look like, showing exactly which field comes from which source.

**Why this doesn't fit today's model**: `dpp_values.source_system`
(manual/m3/pim/plm/qc/api/import, CLAUDE.md §14) only records where a
value *actually came from*, once one exists. There's no way today to
declare an *expected* source on a `field_definition` before a value is
entered, nor a "pending from M3" placeholder state.

**What's easy vs. what's new**:
- A pre-production preview page is low-risk - `resolveStylePassport()`
  and `resolveGtinPassport()` already work without any Batch, so a
  preview view is mostly a UI wrapper around what already exists.
- Declaring an *expected* source system per field is new modeling -
  likely a new column on `field_definitions` (e.g.
  `expected_source_system`) plus UI to show "pending from M3" when no
  value exists yet. Not designed in detail - needs its own design pass,
  not bundled into freeze-at-production.

**Extended (2026-09-19, still idea only)**: two follow-on questions the
user wants to think through, not yet designed:
- **What metadata does an efficient external fetch need per field?**
  Beyond just naming *which* system a field comes from
  (`expected_source_system`), an actual automated fetch would need
  something like the external system's own key/field identifier for
  that value (e.g. an M3 item attribute code), possibly a mapping/
  transform, and a sense of freshness (fetch-on-demand vs. cached).
  None of this exists yet - `source_system` today is just a flat label
  recorded after the fact, not a fetch specification. Real
  integrations aren't being built yet per CLAUDE.md §14/§26, so this
  is about designing the *shape* of that future config, not building a
  fetcher.
- **Freeze-at-production must cover externally-sourced values too, not
  just manual ones**: "När batch i production så måste all data sparas
  i Batch och dess tabeller" - whatever value was showing on a
  passport when a Batch is marked produced (whether it was typed in
  manually or fetched from M3/PIM) needs to be part of the same
  Batch×Style snapshot described above. This isn't a separate
  mechanism - it's confirmation that freeze-at-production, once built,
  must snapshot the *resolved* value regardless of where it came from,
  not just style/variant text fields. Worth keeping in mind so
  Phase 2's external-source config doesn't end up needing its own,
  separate locking logic later.

## GTIN style_id/variant_id consistency ✅ Done (2026-09-19)

**Problem found while discussing the Style/Variant question above**:
`gtins.style_id` and `gtins.variant_id` were both accepted as
independent input with no check that they agreed - a GTIN could end up
pointing at a variant belonging to a *different* style, silently
breaking the GTIN → Variant → Style inheritance chain.

**Built**: `repositories/gtins.js`'s `create()` now derives `style_id`
from the variant when one is given (ignores/overrides whatever
`styleId` the caller passed). `services/import-service.js`'s CSV
import (the one live path that accepts both independently per row) now
validates the two agree and rejects the row with a clear error
otherwise. See CHANGELOG.md etapp 44.

## Batch × Style/Variant scoped overrides ✅ Done (2026-09-16)

**Problem**: a Batch can span multiple Styles (CLAUDE.md's PO45001234
example - confirmed for real with batch 1, which spans 4 different
styles). A plain Batch-level `dpp_values` override applied to the
*whole* batch regardless of which Style a GTIN belonged to - no way to
set a different `country_of_origin` for two Styles produced in the
same run. User: "Man måste kunna skriva över Fälten per STYLE eller
Style Variant på i rn Batch."

**Built**: new `batch_style_scopes` table (`batch_id`, `style_id`,
nullable `variant_id`) - `dpp_values` points at a row here via
`entity_type='batch_style'`, same pattern as every other level. SQLite
doesn't enforce uniqueness across NULL `variant_id` rows, so
`repositories/batch-style-scopes.js`'s `getOrCreate()` does an explicit
SELECT-before-INSERT rather than relying on the table's UNIQUE
constraint.

**Resolution precedence extended**: `SGTIN > GTIN > Batch×Variant >
Batch×Style > Batch > Variant > Style` (`passport-resolver.js`) - a
more specific scope always wins. `services/field-service.js`,
`services/override-service.js`, and `repositories/fields.js`
(`getFieldsForLevel`'s editable-column map) all treat `batch_style` as
a first-class entity type, reusing the existing `editable_at_batch`
permission flag rather than adding a new one - it's the same
conceptual level, just narrower scope.

**Admin UI** (`batch-detail.ejs`): a "Scope" tab row above DPP Field
Values, same visual pattern as the language tabs - "Whole batch" plus
one tab per Style/Variant combination actually present in that batch
(derived from `batch_gtins`, via `listCombosForBatch()`). Switching
scope reloads the field cards/edit form against that scope; saving a
value for a scope not yet used creates its `batch_style_scopes` row on
demand (viewing never does - a GET request must never write to the
database). GTIN/SGTIN detail pages' "inherited from" chains extended
to check both scope levels too, so the admin UI never claims a value
is "inherited from Batch" when a more specific scope override is
actually what's being shown.

**Verified end-to-end** on real batch 1 (spans styles 112327, 131274,
910006, 500001): set `country_of_origin` = "Italy" scoped to style
131274 only - confirmed style 131274's SGTIN resolved it
(`source: "batch_style"`) while style 112327's SGTIN was unaffected;
then set a whole-batch value and confirmed style 131274 kept its more
specific override while style 112327 picked up the whole-batch value
(precedence order confirmed correct); cleared the scoped override and
confirmed it fell back to the whole-batch value; full regression sweep
of all 8 admin tabs + 6 detail page types + the public passport all
still 200.

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

## Phase 4 — Economic operators ✅ Done (2026-09-16)

**Built**: `economic_operators` table (`role`, `legal_name`, `address`,
`country`, `registration_number`) + nullable `styles.operator_id` /
`batches.operator_id` columns - a batch without its own operator falls
back to its GTINs' style's operator, same precedence pattern used
everywhere else in this schema (`repositories/economic-operators.js`'s
`resolveForBatchAndStyle`).

- New **"Economic Operators" tab** in the admin hub (`hub-v2.ejs`) -
  list/add/edit/delete, same inline-edit-row pattern as DPP Fields.
- **"Legal Responsibility" card** on the Style detail page (assign an
  operator) and a **"Legal Responsibility Override" card** on the
  Batch detail page (optional override, with an explicit note that a
  batch can span multiple styles so this is opt-in, not "inherited
  from Style" like the DPP field cards).
- `passport-resolver.js`'s `resolveSgtinPassport` now resolves and
  returns `economicOperator` alongside the existing fields.
- Public passport (`dpp-passport.ejs`): the resolved operator renders
  as a field row inside the existing "EU Required Information"
  accordion (role → e.g. "Manufacturer" as the label, legal name +
  address/country as the value) - it's EU-mandated info, so it belongs
  in that section rather than a new one.
- JSON export (`passport-page-service.js`): new `economicOperator`
  object (`role`, `legalName`, `address`, `country`,
  `registrationNumber`, `source`).

**Verified end-to-end**: created a manufacturer ("Nudie Jeans AB",
Sweden) via the admin tab, assigned it to style 113756, confirmed it
rendered correctly on both the admin Style page (dropdown pre-selected)
and the public passport/JSON (`source: "style"`); tested the Batch
override, then deleted an operator and confirmed the reference falls
back to "no operator" gracefully (no FK enforcement in SQLite here, so
`resolveForBatchAndStyle` treats a stale id as unset rather than
erroring) rather than breaking the passport.

## Phase 5 — Expanded field definitions (not started - planning only)

New `field_definitions.category` values: `svhc_reach`,
`environmental_pef`, `reparability`, `end_of_life`. Candidate fields
(placeholder — pending the delegated act's final annex, see
COMPLIANCE.md open questions):
- `hazardous_substances_declaration` (SVHC/REACH)
- `carbon_footprint`, `water_usage` (PEF)
- `repairability_score`, `spare_parts_availability` (reparability)
- `recycling_instructions`, `takeback_program` (end-of-life)

**Level assignment decided 2026-09-16** (which `editable_at_*` boxes to
pre-check when these fields are created via the existing DPP Fields
tab - no new mechanism needed, this reuses the level system built in
Phase 0):
- **SVHC/REACH + PEF** (`hazardous_substances_declaration`,
  `carbon_footprint`, `water_usage`): **Style + Variant + Batch**.
  Chemical content and environmental footprint can differ per Variant
  (e.g. a printed/embroidered variant needs different chemicals than a
  plain one) and per Batch (a different factory/supplier for one
  production run) - not fixed to the base Style like a pure design
  property.
- **Reparability** (`repairability_score`,
  `spare_parts_availability`) and **end-of-life**
  (`recycling_instructions`, `takeback_program`): **Style + Variant**
  only. These are properties of the garment's construction/the brand's
  program, not the production run - a Variant with different
  hardware (buttons, zippers) or material can need its own value, but
  it doesn't vary between Batches of the same Variant. No Batch
  override.
- GTIN and SGTIN are deliberately left unchecked for all of these -
  size/color (GTIN) and an individual physical garment (SGTIN) don't
  change chemical content, environmental footprint, repairability, or
  end-of-life instructions.

Not yet built - waiting on other things to be checked first before
starting implementation.

## Separately tracked (not phased — do independently)

- ~~**DPP Fields tab has no edit/delete UI, and no Levels column**~~ ✅
  Done (2026-09-16). `/admin-v2?tab=fields` only lists field definitions and lets
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
  authenticated path, design not yet started. Confirmed via web search
  (2026-09-16) that ESPR does define broad role-based access in
  principle — consumers, economic operators (manufacturers/importers/
  distributors), repairers, recyclers, customs and market-surveillance
  authorities, civil society — but the exact per-role data matrix is
  set by each product category's delegated act, not the base
  regulation. See "Discovery session" below for the concrete plan.
- **Visual redesign.** ✅ Done (2026-09-16) — see DESIGN_SYSTEM.md and
  the CHANGELOG etapp 1-8 entries. Consumer passport, DPP Hub, all 5
  detail pages, login, and the confirm/alert modal are all in code now.

## Settings tab: merged Economic Operators + Field Config ✅ Done (2026-09-17)

User insight, arrived at via discussing Economic Operators: in
practice Nudie is the manufacturer/responsible party for effectively
all its own products (confirmed: exactly one operator row exists,
"Nudie Jeans AB") - this isn't per-product masterdata you assign one
at a time, it's closer to a **global company setting** with rare
exceptions. That reframing led to a broader point: Economic Operators
and Field Config are both system-wide configuration, not data you
browse (unlike Products/Batches/Individual Units) - and the same
category will eventually include Users and Permissions.

**Built now**: merged the two into one **Settings** tab with its own
sub-nav (`?tab=settings&sub=operators` / `&sub=fields`), replacing
their separate top-level nav entries. `routes/admin/hub-v2.js`'s
`tab === 'settings'` branch dispatches to the same two queries that
previously lived in separate `'operators'`/`'fields'` branches -
behavior unchanged, just regrouped. Updated every internal link that
pointed at the old `?tab=fields`/`?tab=operators` (category filter
pills, `style-detail.ejs`'s "no operators yet" link).

**Deliberately not built yet**: no default-operator fallback (the
"you shouldn't have to assign an operator per Style for the normal
case" idea) and no Users/Permissions placeholder tabs - both are real
follow-ups, tracked separately, not built speculatively ahead of need.

Verified: bare `/admin-v2?tab=settings` defaults to the Operators
sub-tab; `&sub=fields` switches correctly; sub-nav active states
correct; full regression sweep (all top-level tabs + all detail page
types + the public passport) still 200.

## Products tab: replaced Styles/Variants/GTINs ✅ Done (2026-09-17)

Per user's own proposed rollout (add additively, verify, then remove):
the Styles, Variants, and GTINs Masterdata tabs are now **removed** -
their nav links, route branches, and view sections are gone. Detail
pages (`/admin-v2/style/:id`, `/variant/:id`, `/gtin/:id`) are
untouched and fully reachable (they're separate routes from the list
tabs that pointed to them) - only the flat "browse all Styles" /
"browse all Variants" / "browse all GTINs" list views are gone,
replaced by the Products tab's grouped 3-level tree.

Also updated: the hub's default tab (`req.query.tab || ...`) from
`'styles'` to `'products'`, so a bare `/admin-v2` lands on the right
page; `import.ejs`'s post-import "View GTINs in Hub" link now points
at `?tab=products`; the Products nav link is now just "Products" (was
"Products (new)" during the parallel-testing period).

Verified: bare `/admin-v2` now renders the Products tab; the old
`?tab=styles/variants/gtins` params no longer crash (render an empty
card, matching how an unrecognized tab always behaved) since no code
elsewhere still links to them; full regression sweep of all 9
(now effectively 6) tabs still 200.

## Discovery session (2026-09-16) — not built yet, decisions only

A working session going through open questions before the next build
phase. Each item below is a decision/plan, not yet implemented.

- **Fields need a `section`, separate from `category`.** Today the
  public passport groups fields into display sections by hardcoded
  `if/else` on `category` (`eu_required` → one bucket, `nudie` →
  another) — too blunt. An `eu_required` field like `country_of_origin`
  might belong under "Production" rather than a generic EU bucket.
  Plan: add `field_definitions.section` (e.g. `eu_required`,
  `production`, `nudie`, `transparency`, future categories),
  independent of `category` (EU/Nudie badge) and `editable_at_*`
  (which levels can set it). The passport template groups by `section`
  instead of the current hardcoded branches.
- **Transparency (formerly "Supply Chain") should be configurable
  alongside other fields, not invisible to the Fields tab.** Storage
  stays separate (`supply_chain_steps` — a repeating list can't fit
  `dpp_values`'s one-scalar-per-field-per-level shape without a much
  bigger, riskier rebuild of that table). But it should still get a
  `field_definitions` row (`field_key: 'transparency'`) so it
  participates in the same `section`/`category`/`sort_order`/
  `consumer_visible` configuration as every other field. New
  `data_type` value: `repeating_group` — signals to the admin UI "this
  field's actual values live elsewhere; Edit here links out to where
  they're managed" instead of showing an inline text/textarea editor.
- **Searchability at scale.** ✅ GTINs tab pagination done (2026-09-16)
  — user pointed at a real jeans size matrix (waist × length, dozens of
  combinations) as concrete proof this wasn't hypothetical. Added
  `LIMIT`/`OFFSET` (50/page) + a Prev/Next control that preserves
  `search`/`style`/`variant` query params, and a `COUNT(DISTINCT g.id)`
  query reusing the same `WHERE` conditions for the total. Verified by
  temporarily dropping the page size to 5 and confirming page 1/2
  return disjoint rows. ✅ Batches tab search added (2026-09-16) —
  matches the batch's own visible data (Batch ID, Production Order),
  not just the Style filter, per user feedback. SGTINs tab still has
  **no search or pagination at all** — same gap, not yet fixed there.
- **Draft → Active status for Style (and Batch/GTIN).** User proposal:
  a new Style/Variant starts as `draft`; only becomes `active` once its
  first production completes, and only from that point does field-level
  audit/versioning start counting. Partially already exists for Batch —
  `batches.produced_at` ("Mark as Produced") is exactly this mechanism,
  gating `dpp_values.locked_at`/change-log behavior. Style has no
  equivalent yet. Plan: add `styles.status` (`draft`/`active`), flipped
  manually (same UX pattern as "Mark as Produced"), with versioning/
  lock behavior starting only once `active`. Batch/GTIN-level "active
  once shipped" (mentioned as a related idea) needs its own follow-up
  design pass — shipping isn't tracked anywhere in the schema yet.
- **Audit hardcoded columns vs dynamic fields.** Found and fixed one
  real duplication already (`batches.country_of_production` vs the
  dynamic `country_of_origin` field). Other hardcoded columns likely
  have the same problem — `batches.production_order/supplier/factory`,
  `gtins.size_value_*/color`, etc. Plan: go through each one and decide
  — genuine structural identifier (stays a column: `style_number`,
  `gtin`, `serial_number`) vs. actual DPP content that should migrate
  to a dynamic field with a real EU/Nudie category, so it isn't
  invisible to the categorization system.
- **Role-based field visibility (concrete plan).** A simple role
  selector (dropdown on the passport — Customer / Customs / NJ / etc,
  no login required for the POC) that filters which fields render,
  built on the same pattern as the existing `consumer_visible`
  boolean but generalized to a **list of roles per field** instead of
  a single true/false. A field with no roles set is treated as
  visible to everyone (today's `consumer_visible = true` behavior),
  preserving existing behavior. Real authenticated, per-role login is
  a separate, later concern (see "Role-based / authority access"
  above) — this is just the visibility-filtering mechanism.
- **No admin UI to create a new Batch at all.** Same class of gap as
  the Variant and SGTIN ones below - the only `INSERT INTO batches` in
  the codebase are old v1 code in `routes/api.js` (different schema
  entirely - `total_units`, `partner_name`, not v2's `production_order`/
  `factory`/`operator_id` shape) and seed scripts. Found when the user
  asked how to create a batch and pointed at the Batches tab's style
  filter dropdown, mistaking it for a batch-creation control (its
  placeholder said "All Batches" while listing Styles - separately
  fixed, see CHANGELOG.md). No "+ Add Batch" exists anywhere in the hub.
- **No admin UI to create a new Variant at all.** Same class of gap as
  the SGTIN generator below - `variants` rows only ever come from seed
  scripts (`scripts/seed.js`), there's no "+ Add Variant" anywhere in
  the hub. Found while fixing variant B02's demo data (it had
  `product_name = NULL`, falling back to the Style's name - not a real
  scenario, since **every variant will always have its own unique
  name** per user clarification 2026-09-16). When this form is built,
  `product_name` must be a **required field**, not optional-with-
  fallback, even though the database column stays nullable (the
  COALESCE-to-Style fallback in `passport-resolver.js` etc. is
  defensive, not something the UI should ever actively rely on).
- **SGTIN serial number generator doesn't exist.** The schema is
  already correct for GS1 compliance (`UNIQUE(gtin_id, serial_number)`
  is scoped per GTIN, not per batch, so a serial can never collide
  across production runs of the same GTIN) — but there is no admin
  route that actually creates SGTINs at production time at all, only
  seed scripts (`scripts/seed-*.js`) with manually-typed serials. A
  real "produce SGTINs for this batch" feature needs to look up the
  highest existing serial for that GTIN across ALL batches and continue
  from there, never restart at `0001` per batch.
- **Economic operator: default with rare override, instead of
  per-Style assignment.** User: "we're responsible for all our
  products" - in reality there's one operator (Nudie Jeans AB) that
  applies to virtually the whole catalog, confirmed by the data (only
  one row exists). Plan: add an `is_default` flag to
  `economic_operators`; `passport-resolver.js` falls back to the
  default operator when neither Batch nor Style has one explicitly
  assigned, so assigning one per Style stops being the expected normal
  workflow and becomes the rare exception (e.g. a licensed line with a
  different importer). Style/Batch-level assignment (already built)
  stays as the override mechanism, just de-emphasized.
- **Database cleanup.** Untracked stale files sitting in the repo
  (`data/dpp-v2.db.stale-backup`, `data/dpp.db.stale-backup`) should be
  deleted once confirmed unneeded. Also folds in the hardcoded-columns
  audit above, plus a pass over `data/dpp-v2.db` itself for leftover
  test/seed cruft from this session's manual curl testing (e.g. the
  placeholder economic operator/test rows created while verifying
  Phase 4) that shouldn't ship as if it were real reference data.

## DPP Fields tab: Levels column + Edit/Delete ✅ Done (2026-09-16)

- Table gained a **Levels** column: five small tags (S/V/B/G/SG),
  green when a field is editable at that level, grey when not - reads
  straight off the `editable_at_*` columns that already existed but
  were only ever shown in the create form.
- **Edit**: an inline row (toggled open below the field's row) with the
  same fields as creation, pre-filled - `PUT /api/admin/fields/:id`
  already existed but only handled `label`/`description`/`required`/
  `consumer_visible`/`sort_order`/`category`; added the five level
  flags to it.
- **Delete**: `DELETE /api/admin/fields/:id` didn't exist at all -
  `fieldRepository.deleteFieldDefinition()` (which already refuses to
  delete a field with values assigned) was written but never wired to
  a route. Added the route + a `fieldService.deleteField()` wrapper.
- Fixed a real bug while adding the level flags to the PUT route: the
  original handler destructured `req.body` fields directly into the
  update object, so a field a caller didn't send became `undefined` -
  sqlite3 throws on an `undefined` bind parameter. Now only fields
  actually present in the request are included, booleans coerced to
  `1`/`0`.
- Verified end-to-end: partial PUT (only one level flag) leaves every
  other field untouched; delete succeeds on an unused field and is
  correctly refused (400, clear error) on one with `dpp_values`
  attached; full create → edit → delete cycle tested via the same
  calls the UI's JS makes, not just the route in isolation.

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

## Supply Chain data structure ✅ Done (2026-09-16)

**Finding, from real reference data the user pulled from nudiejeans.com**:
the live site's "Transparency" panel shows a two-level structure -
category (Raw Material, Yarn Process, Fabric Process, Trims,
Manufacturing, Transportation) → named role (Spinning, Weaving Mill,
Thread Supplier, ...) → one or more supplier entries (name, city,
country, employee range, "Visited by Nudie Jeans" badge). The current
`field_definitions`/`dpp_values` system can't represent this - it's one
scalar value per field per level, not a repeating list of structured
records. Notably, the old v1 schema *did* have a `transparency_data`
table with JSON columns for exactly this, dropped when v2's simpler
per-field model was built.

**Decision**: build a dedicated `supply_chain_steps` table, separate
from the field system - see the schema note in this section as it's
built. CO2/water-style scalar metrics do NOT need this - they fit the
existing dynamic field system fine (new `field_definitions` rows,
category `environmental`), and get inheritance/override/locale/lock
for free that way.

**Built**: `supply_chain_steps` table (`repositories/supply-chain.js`,
CRUD routes in `routes/admin/hub-v2.js` under `/style/:id/supply-chain`
and `/supply-chain/:id`), a "Supply Chain" card on the Style admin
detail page (add/view/delete, grouped by category), and a matching
"Supply Chain" section on the public consumer passport
(`views/dpp-passport.ejs`), placed after Production.

**Reference test article**: style `113756` (Tuff Tony Dry Selvage, real
product on nudiejeans.com) seeded with its real 19-step supply chain
via `scripts/seed-supply-chain-113756.js` - verified end-to-end on both
the admin page and the public passport, including correct UTF-8
rendering of non-ASCII supplier/city names (Söke, Türkiye, Berning
+Söhne, Borås). Its real size-matrix (Waist 24-38 × Length 28-36) was
not modeled - only one placeholder GTIN (W32/L32) was created to have
an SGTIN to test the passport with.

**Machine-readable (JSON) follow-up**: the `/json` export
(`renderPassportJson` in `services/passport-page-service.js`) is the
ESPR-required machine-readable form of the passport - a registry/API
pull, not a consumer scan, so it logs no scan event. It was missing
`lastUpdated`/version info and the full Supply Chain data. Added:
- `passportVersion` / `lastUpdated`, read from `passport_versions`
  (already tracked, just not exposed) - not a separate change-log
  export. Full field-level audit history stays internal/admin-only
  (`field_change_log`); the consumer/API-facing passport only needs
  "what does it say now" and "as of when", not every historical edit.
- `supplyChain`, same grouped-by-category shape as the HTML passport
  (`supplyChainRepository.getGroupedForEntity`), so the JSON and HTML
  views can never drift apart.
- `product.imageUrl`, filling out the product block (effective
  variant image falling back to Style, same COALESCE pattern used
  elsewhere).
Verified against style `113756`: 19 steps across 7 categories, UTF-8
intact, `passportVersion: 1`.

## Consumer passport content fixes ✅ Done (2026-09-16)

Per direct feedback while reviewing the redesigned consumer passport:
- Section order changed to EU Required → **Production** → **Nudie
  Information** → Lifecycle Events → Identifiers (Production moved
  above Nudie Information).
- **Scan History section removed** from the consumer-facing passport -
  not useful to the customer (it's still tracked and shown in the
  admin Scan Analytics tab, just not exposed publicly).
- **Found and fixed a real data duplication**: `batches.country_of_production`
  (a hardcoded column, no inheritance/override/locale/lock support) and
  the dynamic `country_of_origin` field (`field_definitions`/`dpp_values`,
  category `eu_required` - the one used throughout this session's
  Tunisia→France examples) were two separate sources of truth for the
  same fact. Per decision: the dynamic field wins.
  `country_of_production` was never actually shown in the consumer
  Production section (checked - only Batch ID/Production Order/
  Production Date/Supplier/Factory are), but it WAS duplicated into the
  JSON export's `manufacturing.countryOfProduction` - removed from
  there. The column itself is left in the schema (not a migration,
  just stopped reading it) - `country_of_origin` is the single source
  of truth going forward.

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
