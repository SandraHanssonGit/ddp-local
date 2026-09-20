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

**This table and the one below it are historical (2026-09-16) and no
longer reflect current priority** - kept for context, not as the
current plan. See "Platform vision, consolidated" further down for
the current state of everything (built / designed / genuinely new),
and the current backlog priority immediately below for what's
actually outstanding right now.

## Current backlog priority (2026-09-20)

In this order: fix known bugs first, then the probable follow-ups
flagged from this session's fixes, then the placeholder new-feature
items (not designed in depth yet, just captured so they aren't lost).

**1. Bugs** (see "Known bugs found during this work" below for detail)
- ~~`repositories/sgtins.js`'s `create()` omits `batch_id` from its
  INSERT~~ - **checked 2026-09-20, already fixed**: `create()` already
  inserts `batch_id` correctly (`INSERT INTO sgtins (gtin_id, batch_id,
  serial_number, sgtin, rfid_id, qc_status)`), and the `produce-sgtins`
  route already calls it with the right argument order. Stale note,
  left over from before this session's Batch Contents / produce-sgtins
  work touched this path.
- ~~Orphaned `batch_gtins` row~~ - **fixed 2026-09-20**: `batch_gtins.id=1`
  (batch 1 → `gtin_id=1`, which no longer existed in `gtins`) deleted
  after confirming no `dpp_values` or `field_change_log` rows
  referenced it. Verified the Batch page and hub still render
  correctly afterward.

**2. Follow-ups**
- ~~Variant and SGTIN admin detail pages likely have the same
  "only shows editable-here fields" bug~~ - **confirmed and fixed
  2026-09-20**: both used the narrow `getFieldsForLevel(level, id)`
  pattern. Added `resolveVariantPassport()` to `passport-resolver.js`
  and wired SGTIN detail to the already-existing
  `resolveSgtinPassport()` instead of hand-building the inheritance
  chain. See "Variant and SGTIN detail pages were hiding non-editable
  fields entirely" below for full detail.

**3. New feature placeholders** (captured, not designed in depth)
1. External API / GraphQL access - see "External API / integration
   access" below.
2. Test Scan tool - design already confirmed (see "Soft/lazy SGTIN
   creation on first scan..." below), just needs building; should live
   under its own Settings tab.
3. Admin Hub role-based access control (RBAC) - see "Admin Hub
   role-based access control (RBAC)" below.

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

## Platform vision, consolidated (design 2026-09-20, not built)

User stepped back and described the whole target platform in one pass
after "jag har tänkt lite" - this section maps every part of that
vision against what already exists, what's already designed, and
what's genuinely new. Nothing in this section is built yet.

**Already built** (see git history / earlier sections for detail):
- `locks_at_production` per field (not just per category) - covers
  "all EU fields lock at production" AND "some NJ fields should also
  lock like EU fields."
- Freeze-at-production (Batch×GTIN snapshot + `field_change_log` entry
  with reason) - covers "locked, but correctable if wrong, as long as
  it's carefully logged."
- `consumer_visible`, enforced on the live public passport - binary
  public/not-public control.
- `editable_at_sgtin` already exists as a column - serial-level field
  support needs no new schema, just field_definitions rows with that
  flag set, whenever/if EU serial-level rules materialize.

**Already designed, not built** (see their own sections above/below):
- Field Sections (headings) - matches "man skall kunna säga i vilken
  sektion något skall hamna. Det påverkar hur productpasset ser ut."
- Field source/provenance + pre-production preview - matches "EU data
  from other systems needs to be available for review before
  production."
- "Test scan a passport" tool + coarse geo-location on scan - matches
  the scan-statistics ask.
- Soft/lazy SGTIN creation on first scan - matches "soft activation."

**Confirmed, no new mechanism needed**: NJ fields that stay
perpetually externally-fed and never lock are just
`locks_at_production = false` + the (not yet built) field-source
config resolving live from `source_system` - not a separate feature.

**Genuinely new - designed below**:
1. Extended authority/recycler view (confirmed scope: external
   parties, not internal admin roles)
2. Structured fields per lifecycle event type
3. Customizable per-passport page layout - confirmed **explicitly
   deprioritized** by the user ("det ligger längst fram i planen") -
   logged here only so it isn't forgotten, no design work started.

### 1. Extended authority/recycler view ✅ Done (2026-09-20)

**Problem** (COMPLIANCE.md gap #7, restated): the public passport only
has one visibility level (`consumer_visible`). A market-surveillance
authority or a recycler legitimately needs to see more than a regular
consumer - but there must not be a self-service "pick your role"
toggle on the public page, since that would let anyone claim elevated
access (COMPLIANCE.md's own conclusion, now confirmed as the direction
to build).

**Confirmed scope**: this is about external parties (authority/
recycler), not an internal admin permissions system - a separate,
simpler problem than a full RBAC system.

**Built, then immediately superseded by "Digital Access" (same day,
2026-09-20)** - kept below as the historical first pass:
- `field_definitions.authority_visible` boolean, exposed in Field
  Config's create/edit forms and fields table.
- New `middleware/auth.js` (`verifyToken`/`checkRole`/`requireRole`) -
  mirrors `routes/api.js`'s existing JWT pattern. Turned out
  `/api/login` already worked against v2's real `users` table
  (`DB_VERSION` defaults to `v2`) - no new login/JWT-issuing code
  needed, only the verification/role-check side.
- `GET /01/:gtin/21/:serial/authority` (`routes/gs1.js`), protected by
  `requireRole(['authority', 'recycler', 'admin', 'super_admin'])` -
  the first v2 route to enforce auth (see "Security note" below).
- Reused `dpp-passport.ejs` as-is via a `renderAuthorityPassportPage`
  filtered by `authority_visible` - no template changes needed, since
  EU Required/Nudie Information already iterate `resolvedFields`
  generically.
- Verified working end-to-end (redirect/403/200 flow, flags confirmed
  independent) before the user asked for the more general version.

**Superseded design ("Digital Access", built same day)**: user
feedback was that two hardcoded booleans was still "too hardcoded" -
wanted a configurable roles list (any number, not just two) managed
under Settings, with each field picking which roles see it, and an
explicit product decision that the passport should have a **visible
role switcher with no login required for now** (COMPLIANCE.md gap #7's
concern accepted as a known tradeoff, not overlooked - password-gating
specific roles is supported but not turned on for any role yet).

- New `roles` (`role_key`, `label`, `requires_auth`, `is_default`) and
  `field_roles` (many-to-many) tables, replacing
  `consumer_visible`/`authority_visible` entirely - guarded migration
  seeds `consumer`/`authority`/`recycler`, backfills `field_roles` from
  the two old flags, then drops both columns. New Settings > **Digital
  Access** tab (list/add/edit/delete roles - the default role can't be
  deleted). Field Config's two checkboxes replaced by a dynamic
  "visible to which roles" checkbox group.
- `services/passport-page-service.js`: one `filterByRole(fields, roleId)`
  replaces the two old filter functions. New `resolveRoleForRequest`
  reads `?role=<role_key>` (default the `is_default` role) and enforces
  that role's `requires_auth` at render time (not via static route
  middleware, since the requirement is now per-role DB state, decided
  per-request) - redirects to `/login` or 403s on a role mismatch,
  otherwise renders with no auth at all. `renderAuthorityPassportPage`
  and the dedicated `/authority` route are gone - `?role=authority` on
  the normal passport URL does the same thing, generalized to any role.
  `renderPassportJson` supports `?role=` the same way.
- `views/dpp-passport.ejs` gained a role-switcher pill bar (same
  pattern as the existing language tabs) and a generic "Viewing as: X"
  banner for any non-default role, replacing the authority-specific one.

**Verified**: migration backfilled all 10 existing fields' role_roles
with no data loss, old columns confirmed dropped; `?role=authority`
renders immediately with no login; toggling a role's `requires_auth`
on reproduced the exact same redirect/403/200 flow as the superseded
design, now fully dynamic instead of hardcoded to one route; Field
Config and Digital Access CRUD verified end-to-end.

### 2. Structured fields per lifecycle event type (not built)

**Problem**: `lifecycle_events.event_data` is free-form JSON today -
flexible, but nothing defines *which* fields belong to e.g. a
"Repaired" event (repaired by whom, cost, parts replaced) vs. a
"Returned" event, so the "Add Event" admin form can't render the right
inputs per event type.

**Confirmed design**: same pattern as `field_definitions`/`dpp_values`,
scoped to event types instead of DPP entity levels:
- New `lifecycle_event_field_definitions` table (`id`, `event_type`,
  `field_key`, `label`, `data_type`, `required`, `sort_order`) -
  defines which fields render for each event type's "Add Event" form.
- Values stay in the existing `lifecycle_events.event_data` JSON
  column - no new value-storage table needed, since event_data is
  already a flexible per-event blob. The new definitions table only
  drives *which* fields the admin form shows and validates for a given
  `event_type`, not where the values are stored.

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
- `gtin_sgtin` — individual units still exist and are still serialized,
  resolved exactly like `batch_gtin_sgtin` today (Batch still fully
  participates in field inheritance/freeze-at-production, nothing
  changes there) - **confirmed (2026-09-19): the only difference is
  presentational**, the printed code/QR just doesn't encode a
  batch/lot segment. No resolver change needed for this scheme at all;
  it only affects Phase 3 (identifier/URL construction).

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
  no SGTIN layer), needed only for the `batch_gtin` scheme.
  `gtin_sgtin` needs no resolver work at all - it resolves exactly like
  `batch_gtin_sgtin` (confirmed above), just renders a different URL in
  Phase 3.
- **Phase 3 — Public routes**: new `GET /01/:gtin/10/:lot` in
  `routes/gs1.js` for the `batch_gtin` scheme (lot = the existing
  `batches.batch_id`, confirmed — no new lot field needed), wired to a
  new render path in `passport-page-service.js`. `gtin_sgtin` reuses
  the existing `/01/:gtin/21/:serial` route unchanged - per the
  Explore agent's research (2026-09-19), today's Digital Link URL
  never encodes a batch/lot segment for *any* scheme, so the
  "presentational-only" difference confirmed above needs a closer look
  at implementation time: it may mean the two schemes render
  genuinely identically at the URL/QR level, with the distinction only
  mattering for how a physical barcode label (not just the web link)
  is specified - worth re-checking with the user once this phase is
  actually reached rather than assuming a concrete difference now.
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

## Freeze-at-production for master data changes ✅ Done (2026-09-19, design 2026-09-17)

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
- No new tables or schema needed - reuses `dpp_values` exactly as it
  already works, with one new `entity_type` value; only "Mark as
  Produced" needs new logic to perform the snapshot instead of just
  flipping `produced_at`.

User asked to pause here to focus on Batch work directly before
building this - captured so the decision isn't re-litigated later.

**Superseded (2026-09-19) - see below**: the original plan snapshotted
only Style/Variant values onto `Batch×Style` (`batch_style_scopes`).
Walking through it with the user surfaced a real gap: GTIN already
outranks `Batch×Style` in resolution precedence, so a live (unfrozen)
GTIN master-data edit after production would still leak through
untouched - freezing Style/Variant alone doesn't actually close the
loop. Replaced by the Batch×GTIN design directly below.

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
  (`dpp_values.locked_at` is scoped per entity level already); an
  individual SGTIN can still carry its own rare explicit override
  (e.g. a defect note) above everything else, unaffected by the
  Batch×GTIN freeze below.
- **Lifecycle data intentionally excluded from the freeze**: downstream
  lifecycle events (Viewed/Sold/Repaired/...) are Nudie-specific,
  expected to keep evolving after production - confirmed they should
  NOT be touched by the lock. Already true structurally (`lifecycle_events`
  is a separate, always-appendable table `dpp_values`/the freeze never
  touches) - no change needed.
- **Not every field should lock, even among regular DPP fields
  (2026-09-19)**: user: "För NJ fält kanske man skall kunna låta dem
  ligga olåsta efter att produktpasset EU fält låsts... De är ju upp
  till oss vad vi vill ha i de fälten." EU-required fields must lock at
  production (that's the whole point - proving the compliance data is
  fixed); Nudie-specific fields are the brand's own discretion and may
  legitimately need continued editing after production (storytelling,
  marketing copy) without that being a compliance problem. **Confirmed
  design**: new `field_definitions.locks_at_production` boolean,
  defaulting to `true` when `category = 'eu_required'` and `false` when
  `category = 'nudie'` - editable per field in Field Config so a
  specific field can override its category's default in either
  direction. The Batch×GTIN freeze snapshot only writes fields where
  this resolves to `true`.
- **Externally-sourced fields must freeze too**: ties together with
  the field source/provenance idea below - a field whose value comes
  from M3/PIM still gets captured into the Batch×GTIN snapshot at
  production time exactly like a manually-entered one. Not a separate
  mechanism, just confirms the freeze reads *resolved* values
  regardless of `source_system`.
- **Gap found during EU-compliance analysis (2026-09-19)**: the freeze
  operation itself must write a `field_change_log` entry per field it
  locks (`action` = `'created'` or a new `'locked'` value, timestamped
  to the batch's `produced_at`), not just log *later* edits to the
  frozen value. Without that, there's no record proving *when* a given
  field was actually locked - only that it currently is. Needed for
  the audit trail to hold up as real evidence, not just an assumption.
- **Real gap found**: `field_change_log.reason` already exists in the
  schema (CLAUDE.md §13), and `audit-service.js` already records it
  when passed - but no edit form in the admin UI actually has a reason
  input. Editing a field after lock captures old/new value + who/when
  automatically, but never asks why. Worth adding a "reason (optional)"
  text input to the field-edit UI wherever a locked value can still be
  overridden (`batch-detail.ejs`'s DPP Field Values edit mode, and
  wherever GTIN/SGTIN-level fields are edited).

**Batch×GTIN freeze - the corrected snapshot target (2026-09-19,
current design, not yet built)**:
- **Freeze happens per GTIN, not per SGTIN.** User: "Tanken är att bara
  hålla Lifecycle data på SGTIN nivå. Efterproduktionsdata... vid
  låsning så låses allt till GTIN nivå." One frozen snapshot covers
  every physical unit of that GTIN in that batch - it does NOT touch
  each individual SGTIN row (which could be thousands), keeping the
  lock operation cheap regardless of batch size.
- **No new table needed** - `batch_gtins` (batch_id + gtin_id) already
  uniquely represents "this GTIN within this Batch," so the snapshot
  is just a new `entity_type='batch_gtin'` in `dpp_values` pointing at
  `batch_gtins.id`, the same pattern `batch_style` already uses for
  `batch_style_scopes`.
- **What gets resolved and frozen**: for every `batch_gtins` row in the
  batch, and every field with `editable_at_batch = 1`, resolve
  **today's** effective value the same way a live GTIN passport would
  - GTIN's own explicit master-data value if one exists there,
  otherwise falling through to Variant then Style ("Gtin hämtar vid
  låsning in data från Master GTIN om något finns där" - confirmed by
  the user) - and write it explicitly at `Batch×GTIN`, stamped
  `locked_at` immediately.
- **New resolution precedence**: `SGTIN > Batch×GTIN > GTIN >
  Batch×Variant > Batch×Style > Batch > Variant > Style` - `Batch×GTIN`
  slots in directly above plain `GTIN`. This closes the gap the
  original Style/Variant-only design missed: a later edit to the
  GTIN's own master-data value can no longer leak into an
  already-produced batch, because the frozen `Batch×GTIN` row now
  outranks it. A rare individual SGTIN override still wins over
  everything, as it already does today.
- **`batch_style_scopes` is unaffected and keeps its original purpose**:
  manually overriding a value for a whole Style/Variant *before*
  production, useful in a multi-style batch. The freeze doesn't write
  there anymore - it computes the final per-GTIN resolved value
  (which already accounts for any `Batch×Style` override in effect)
  and snapshots that one level higher, at `Batch×GTIN`.
- **Resolved (2026-09-19)**: a new SGTIN created after a batch is
  already locked just automatically inherits the frozen `Batch×GTIN`
  snapshot - no blocking needed, works by construction since
  `Batch×GTIN` already outranks plain `GTIN` for any SGTIN under that
  GTIN+batch. No extra logic required for this case.

**Built (2026-09-19)**: `field-service.js`'s `freezeBatchAtProduction()`
implements exactly the design above, called from `/batch/:id/mark-produced`
before `produced_at` is set. Reason-capture on post-lock edits also
built (`dppPrompt()` in `admin-modal.js`). See CHANGELOG.md etapp 48
for verification details - including a serious pre-existing bug found
and fixed along the way: `dpp_values` writes were silently duplicating
rows instead of updating in place for any default-locale value (see
CHANGELOG.md etapp 48 / git commit `310a963`).

**Gap found and resolved for the existing batch (2026-09-19)**: user
noticed batch 1 was marked produced (2026-09-16) *before*
`freezeBatchAtProduction()` existed (2026-09-19), so it never actually
ran for it - confirmed directly (0 rows at `entity_type='batch_gtin'`
in the whole database). No general "re-freeze an already-locked batch"
UI was built - user only wanted the one existing batch fixed, not a
recurring capability - so `freezeBatchAtProduction(1, {reason: ...})`
was called directly once via a script. Froze 3 fields (2 on GTIN 3, 1
on GTIN 6) correctly; verified live on the public passport (`source`
now `batch_gtin` for those fields). If more batches are ever
discovered in this situation, the same one-off approach applies - no
standing feature needed for a one-time POC data gap.

**Decision (2026-09-19): frozen values stay off the Batch Contents
tree.** Considered showing an expandable "DPP Fields" per GTIN row in
the tree so freezing is visible/verifiable there too - declined, the
public passport and SGTIN detail page's "Inherited from" chain are
enough; the tree stays focused on production counts (Code Needed/
Units Shipped/Code Activated).

## Batch detail page: unified Style→Variant→GTIN→SGTIN tree ✅ Done (2026-09-19)

**Problem**: the "QR Codes per GTIN" table (flat rows: Style, Variant,
Item #, GTIN, Code Needed, Units Shipped, Code Activated) gets
cluttered once a batch spans several Styles - user: "Denna blir ju
lite krånglig. Borde den inte likna Products tabben men bara visa det
som finns i Batchen?"

**Design confirmed and built**:
1. ~~Batch Info block~~ - built as its own "Batch Information" card
   (info-grid pattern, matching Style/GTIN/SGTIN detail pages), not the
   header/banner/stat-card layout originally sketched here - see the
   dated commits (`14ea2e8`, `fe31d3c`, `63ba876`) for how this evolved
   through direct feedback.
2. **One unified collapsible tree** - built exactly as designed:
   Style → Variant → GTIN → SGTIN, scoped to the batch, same
   expand/collapse pattern as the Products tab (extended one level with
   `data-greatgrandparent`). Search box added afterward (etapp - commit
   `d642bb5`), matching the Products tab's search pattern.
3. Confirmed - the tree replaced both old tables with one card.
4. Confirmed - "Add GTIN to Batch" form removed, API left untouched.
5. **Resolved (2026-09-19/20), superseding the checklist that used to
   be here**: walking through the sub-pages surfaced real confusion -
   `gtin-detail.ejs` shows generic masterdata regardless of which
   batch you arrived from, so a value frozen for *this* batch isn't
   visible there. User rejected bolting batch context onto the
   existing edit-focused Style/Variant/GTIN pages ("Det blir för
   stökigt" - too messy, mixing master-data editing with batch-specific
   resolved values). **New direction, not yet built - see "Batch-scoped
   Style/Variant/GTIN passport view" below.** `sgtin-detail.ejs` was
   confirmed already correct as-is (an SGTIN unambiguously belongs to
   one batch, so its "Inherited from Batch (locked at production)"
   badge already shows the right thing) - the Batch tree's SGTIN rows
   keep linking there, unchanged.

## Batch-scoped Style/Variant/GTIN editing ✅ Done - resolved simpler than originally proposed (2026-09-20)

**Problem**: clicking a Style/Variant/GTIN row in the Batch tree
currently goes to that entity's generic master-data page, which
doesn't reflect what's actually locked/resolved *for this specific
batch* (see point 5 above). User: "Jag vill ju att trädet på
Batchsidan skall gå till sidor som bara visar information som är
korrekt för den batchen."

**Design proposed, not yet approved**:
- New `passport-resolver.js` method `resolveBatchScopedPassport(batchId, entityType, entityId)`
  with precedence depending on level (no SGTIN layer - this is a
  preview/view, not one physical unit):
  - `gtin`: Batch×GTIN > GTIN > Batch×Variant > Batch×Style > Batch > Variant > Style
  - `variant`: Batch×Variant > Batch×Style > Batch > Variant > Style
  - `style`: Batch×Style > Batch > Style
- New route + new template, separate from style-detail/variant-detail/
  gtin-detail.ejs (not mixed in - see the "too messy" rejection above).
- Batch tree's Style/Variant/GTIN action links point here instead of
  the existing detail pages.

**Then the user raised a real complication and asked to pause here**:
before a batch is produced, fields (including ones that will never
lock, like most NJ fields) must still be *editable* at this
batch-scoped level - so this can't be a pure read-only preview like
first proposed. It needs to support editing wherever a field is still
open (unlocked NJ fields always; any field before production). This
overlaps with the already-built Batch×Style "Scope" tabs on
`batch-detail.ejs` (editing overrides scoped to one Style/Variant
within the batch) - worth checking whether that existing mechanism can
be reused/extended for the GTIN level too, rather than building a
second, separate editing surface.

**Resolved much simpler than the read-only-view proposal above**: user
pointed out the Batch Contents tree and the existing Scope-tab field
editor were really the same navigation concept shown twice ("Denna
delen skall ju bli en? Som jag förstår det"). Instead of a new
resolver method, route, and template, **extended the existing
Batch×Style Scope mechanism to also support GTIN-level scoping** via
the already-existing `batch_gtins` table (same entity_id source
`freezeBatchAtProduction()` already uses) - no new schema. The tree's
Style/Variant/GTIN row action arrows now set `?scopeStyle=/
&scopeVariant=/&scopeGtin=` on the batch page itself (scrolling to the
field editor) instead of navigating away; the old flat "Scope: Whole
batch | ..." tab bar was removed as redundant. Editing works
before AND after production - locked fields still show/save through
the normal locked-value + reason-prompt flow (unchanged), unlocked NJ
fields remain freely editable at any scope, at any time. Verified
end-to-end (GTIN-scoped frozen values display and save correctly,
public passport reflects edits immediately, Style-scoping still works
unchanged, full regression sweep green).

**Follow-up, also done (2026-09-20)**: user tried the merged view and
found it "för otydligt" (too unclear) - the scoped field editor only
listed fields *editable at that exact level* (via `getFieldsForLevel`),
hiding everything inherited from Style/GTIN/etc: "man vill ju se alla
fält ner till den nivån man tittar på och man vill ju se alla fält
som är låsta" (want to see every field down to the level being viewed,
and want to see which ones are locked). Added
`passport-resolver.js`'s `resolveBatchScopedFields()` - resolves
*every* field (not just editable-here ones) with its value, source
level, and locked status, same precedence as the SGTIN chain minus
the SGTIN layer. The scoped card now shows three states per field:
set at this scope (editable, lock icon if locked), inherited from
elsewhere (read-only, "Inherited from X" note), or not set anywhere.
Whole-batch view is unchanged.

**Second follow-up, also done (2026-09-20)**: `resolveBatchScopedFields`
showing *every* field (above) meant the edit-mode textarea rendered
for every field too, with no check against any `editable_at_*` flag at
all - Levels config had zero effect in this specific view (only on the
whole-batch view and the standalone GTIN/Style/Variant detail pages).
User asked for it to work "på samma sätt som andra levels" - added an
`editable` flag to each resolved field (checks `editable_at_batch_gtin`
for a GTIN scope, `editable_at_batch` for a Style/Variant scope,
unchanged) and the template now shows a locked, read-only line instead
of a textarea when a field isn't editable at that scope - still
visible (the original requirement above), just not editable. Also
surfaced and fixed a real, previously-invisible bug: Style/Variant-only
fields (Repair Program, Sustainability Information) were incorrectly
editable in this view before this fix.

**GTIN Levels split (2026-09-20)**: raised while discussing the above -
GTIN masterdata (`gtin`) and GTIN-scoped-to-a-Batch (`batch_gtin`) used
to share one `editable_at_gtin` flag ("same permission, just narrower
scope" - see the freeze-at-production design). User: "jag tror vi
skall ha masterdata och sedan Batch data så GTIN måste vara 2 gånger" -
wants them independently decidable, since a field might belong on the
GTIN masterdata page but not be something a batch run should override,
or vice versa. New `field_definitions.editable_at_batch_gtin` column
(guarded migration, backfilled from `editable_at_gtin` so nothing
changes until explicitly split), `getFieldsForLevel` and
`resolveBatchScopedFields` both updated to use it for the `batch_gtin`
case. Field Config's Levels relabeled "GTIN (Masterdata)" / "GTIN
(Batch)". Batch×Style scoping (Style/Variant) intentionally left
sharing `editable_at_batch` - not asked for, and no analogous
"masterdata vs batch" ambiguity exists there the way it does for GTIN.

## Soft/lazy SGTIN creation on first scan + "Test scan a passport" tool (concept idea-only; the test tool itself is fully designed, not built, 2026-09-19)

Raised alongside the question above: rather than requiring every
physical unit to be pre-registered as an SGTIN row before it ships,
user is considering **creating the SGTIN on first scan** instead - the
scanned code (encoded per the GS1 standard) carries enough information
(GTIN + serial, and from there the Batch it belongs to) to look up or
create the SGTIN row lazily at scan time, rather than requiring the
"produce SGTINs for this batch" admin flow (still not built - see the
serial number generator item above) to run first.

This is exactly why "does a new SGTIN inherit the lock correctly"
mattered above - if units are only created reactively as they're
scanned, most of a batch's SGTIN rows may not exist yet at the moment
it's locked, making the automatic-inheritance answer (not a block)
the right one regardless.

**Precedent already in the codebase (not wired into v2)**:
`routes/public/consumer.js`'s `GET /:gtin` route already implements
this exact pattern - "Render GTIN-only passport page (lazy SGTIN
creation pattern)" via `consumerService.getConsumerPassportByGtinOnly()`
- but that route isn't required by `server.js` and uses the old
`db/init.js` (v1), not `db/init-v2.js`. Worth reviewing as a starting
point rather than designing from scratch, once this is picked up -
not scoped or designed for v2 yet.

**"Test scan a passport" admin tool (design confirmed, not built,
2026-09-19)** - a concrete testing use of the pattern above, requested
directly: an admin page to simulate a real-world scan without a
physical code.
- Input: the identifier a real scan would decode to (GTIN + serial -
  what the URL would contain).
- **If that serial doesn't exist yet for the GTIN**: create a new
  Individual Unit (SGTIN) on the spot (the lazy-creation pattern
  above, finally given a concrete first use).
- **If it already exists**: add the submitted data to that existing
  unit instead of creating a duplicate.
- Optional lifecycle event data can be submitted alongside (event type
  + payload); if omitted, it's logged as a plain scan only.
- **Geographic location - legal check done (2026-09-19), not formal
  legal advice, needs real sign-off before shipping**: recommended
  approach is coarse, IP-derived location (city/country), not the
  browser Geolocation API. Reasoning: `scan_events.ip_address` is
  already captured on every real scan today
  (`passport-page-service.js`'s `renderPassportPage`), so deriving a
  coarse location from it adds no new category of personal data and
  can reasonably rely on legitimate interest (GDPR art. 6.1.f) for
  low-precision, aggregate analytics. The Geolocation API would need
  an explicit, separate consent flow for GPS-precise data, which is
  disproportionate for "read your product's passport" and would hurt
  the experience for genuine consumers. **For the test tool
  specifically, no real geolocation lookup is needed at all** - the
  admin using it isn't a real visitor, so a free-text "location"
  field the admin types in themselves (e.g. "Stockholm, SE") is
  sufficient and sidesteps the question entirely for testing purposes.

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

## Field Sections (headings) for Field Config (design confirmed, not built, 2026-09-19)

**Problem**: fields are only grouped today by the `category` column
(`eu_required` / `nudie`) - user wants a second, more granular grouping
so information lands under the right heading (e.g. "Material", "Care",
"Sustainability", "Origin") when displayed.

**Design confirmed**:
- New `field_sections` table (`id`, `label`, `sort_order`), managed
  under Settings - same pattern as Product Types/Economic Operators:
  add a new section any time, and pick its display order.
- `field_definitions` gets a `section_id` FK. Field Config's per-field
  form picks a section from a dropdown rather than free text, avoiding
  typo'd/duplicate heading names.
- Orthogonal to `category` (eu_required/nudie) and to the new
  `locks_at_production` flag above - a field's category still governs
  EU/Nudie badging and the lock default, while its section governs
  where it's grouped for display.

**`repeating_group` data_type ✅ Done (2026-09-20)** - merged in from
the Discovery session's version of this idea (2026-09-16), built after
reviewing a real test DPP's full schema (nudie-dpp.vercel.app)
surfaced the same need directly: Transparency (`supply_chain_steps` -
a repeating list, storage stays separate since it can't fit
`dpp_values`'s one-scalar-per-field shape) got a `field_definitions`
row (`field_key: 'transparency'`, `category: 'eu_required'`) purely
for **Digital Access role visibility** - `category`/`field_sections`
grouping is still pending on the section table below, but role gating
already works today via `fieldRepository.isFieldVisibleToRole()`,
checked in `passport-page-service.js` before fetching
`supply_chain_steps` for both the HTML page and JSON export. No inline
editor for this data type - `style-detail.ejs`'s Edit Mode skips
`repeating_group` fields entirely (nothing to edit there, the
Transparency card already handles that). Verified: restricted the
field to authority/recycler only, confirmed consumers stopped seeing
the section on a style with real seeded steps while `?role=authority`
still did, then restored to all-roles-visible.

**Also built the sibling case, `data_type = 'json'` (2026-09-20)**: for
*fixed-shape* structured objects (Care Instructions restructured as
washing/ironing/bleaching/etc, Transport as route/modes/carrier) that
aren't a growing list - these fit `dpp_values.value` directly as a
JSON string, getting inheritance/override/audit/locale/lock/role
visibility for free like any other field. A shared
`structuredValueHtml()` pretty-printer (duplicated into
`dpp-passport.ejs` and `style-detail.ejs`, matching this codebase's
per-template pattern) parses the JSON and renders a key/value
breakdown instead of the raw string; the edit textarea still shows raw
JSON directly (no custom form builder for this POC); the JSON export
passes the raw JSON string through unchanged. Not yet applied to any
real field (`care_instructions` stays plain text for now) - verified
with a throwaway test field, cleaned up after.

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
  manually or fetched from M3/PIM) is part of the same Batch×GTIN
  snapshot (corrected from the original Batch×Style plan - see the
  freeze-at-production section above). **Confirmed already true**:
  `freezeBatchAtProduction()` (built) reads `dpp_values` regardless of
  `source_system`, so this requirement is already satisfied by the
  existing implementation - no extra work needed once the external-
  source config itself is built.

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

**Resolution precedence extended** (as of 2026-09-16 - Batch×GTIN was
added on top of this later, see the freeze-at-production section above
for the current full chain): `SGTIN > GTIN > Batch×Variant >
Batch×Style > Batch > Variant > Style` (`passport-resolver.js`) - a
more specific scope always wins. `services/field-service.js`,
`services/override-service.js`, and `repositories/fields.js`
(`getFieldsForLevel`'s editable-column map) all treat `batch_style` as
a first-class entity type, reusing the existing `editable_at_batch`
permission flag rather than adding a new one - it's the same
conceptual level, just narrower scope.

**Admin UI** (`batch-detail.ejs`) **- superseded (2026-09-20)**: this
originally built a "Scope" tab row above DPP Field Values, same visual
pattern as the language tabs - "Whole batch" plus one tab per
Style/Variant combination actually present in that batch (derived from
`batch_gtins`, via `listCombosForBatch()`). That flat tab bar was later
removed and replaced by the Batch Contents tree driving scope directly
(see "Batch-scoped Style/Variant/GTIN editing" further up) - the
underlying `batch_style_scopes`/`getOrCreate()` mechanism is unchanged,
only how you navigate to a scope changed. Switching scope reloads the
field cards/edit form against that scope; saving a
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
Style - the example order used when this was written; the actual
level chain has since grown, see the freeze-at-production section
above) for a value in the requested locale first; only if **no** level
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

## Phase 4 — Economic operators ✅ Done (2026-09-16), UI since removed (2026-09-19)

**Superseded**: the "Economic Operators" tab, "Legal Responsibility"
card, and "Legal Responsibility Override" card described below were
all removed later (etapp 45/46, CHANGELOG.md - user didn't understand
the concept, confusing as its own thing for what's really just one
value). Table/repository/API routes are untouched, `resolveSgtinPassport`
still resolves and returns `economicOperator` exactly as described
here - only the admin UI surfaces are gone. See the "Economic
operator" entry under "Discovery session" for the undecided direction
forward (plain custom field vs. a single global default).

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

## Phase 5 — Expanded field definitions (partially built, 2026-09-20)

**Corrected 2026-09-20**: this originally proposed new
`field_definitions.category` values (`svhc_reach`, `environmental_pef`,
etc.) - contradicts the confirmed category/section split decided
later. `category` must stay binary (`eu_required`/`nudie`) since
`locks_at_production` defaults from it (`true` only for
`eu_required`) - a field with `category='svhc_reach'` would silently
default to *not* locking at production despite clearly being an
EU-required compliance field. These fields should get
`category='eu_required'` and use the new `field_sections` mechanism
(see "Field Sections" above) for the SVHC/REACH, PEF, reparability,
end-of-life grouping instead.

Candidate fields (placeholder — pending the delegated act's final
annex, see COMPLIANCE.md open questions):
- ~~`carbon_footprint`, `water_usage` (PEF)~~ ✅ Done (2026-09-20) -
  built after reviewing a real live test DPP (nudie-dpp.vercel.app)
  that already carries this data. `category='eu_required'`, editable
  at Style/Variant/Batch only (matching the level assignment already
  decided below), visible to all Digital Access roles. No
  `field_sections` grouping applied yet since that mechanism still
  isn't built - they show under EU Required same as any other field
  for now.
- `hazardous_substances_declaration` (SVHC/REACH) - not built
- `repairability_score`, `spare_parts_availability` (reparability) -
  not built
- `recycling_instructions`, `takeback_program` (end-of-life) - not
  built

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

- ~~**Enforce `consumer_visible` on the live public passport page.**~~
  ✅ Done (2026-09-19) - `passport-page-service.js`'s shared
  `filterToConsumerVisible()` now applies to both the HTML page and
  the JSON export, so they can't drift apart again.
- ~~**Role-based / authority access.**~~ ✅ Done (2026-09-20) — see
  "Extended authority/recycler view" under "Platform vision". Not a
  public self-service toggle (COMPLIANCE.md gap 7), an authenticated
  path (the first real auth on any v2 route). Confirmed via web search
  (2026-09-16) that ESPR does define broad role-based access in
  principle — consumers, economic operators (manufacturers/importers/
  distributors), repairers, recyclers, customs and market-surveillance
  authorities, civil society — but the exact per-role data matrix is
  set by each product category's delegated act, not the base
  regulation; the built `authority_visible` flag is a single coarse
  level (not per-role), sufficient for this POC.
- **Visual redesign.** ✅ Done (2026-09-16) — see DESIGN_SYSTEM.md and
  the CHANGELOG etapp 1-8 entries. Consumer passport, DPP Hub, all 5
  detail pages, login, and the confirm/alert modal are all in code now.

## Settings tab: merged Economic Operators + Field Config ✅ Done (2026-09-17), since superseded (2026-09-19)

**Superseded** - kept for history, but no longer the current state:
Economic Operators was removed from Settings entirely (etapp 45/46,
CHANGELOG.md) - user didn't understand the concept even as a
Settings-only page ("jag förstår inte fältet"). The `economic_operators`
table/repository/API routes are untouched, just no longer surfaced
anywhere in admin. Direction (plain custom field vs. a single global
default) is still undecided - see the "Economic operator" bullet under
"Discovery session (2026-09-16)" below. An "Access" placeholder
sub-tab ("feature arriving soon") was also added to Settings after
this section was written, contradicting its "no Users/Permissions
placeholder tabs" note below - that note is stale too.

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

- **Fields need a section, separate from category - merged into
  "Field Sections (headings) for Field Config" below (2026-09-20).**
  This entry (2026-09-16) and the later, more detailed one described
  the same feature two different technical ways (a `field_definitions.
  section` column here vs. a separate `field_sections` table there).
  The table design is now the confirmed plan - see that section, which
  has also absorbed this entry's genuinely useful addition: a new
  `repeating_group` `data_type` so Transparency (`supply_chain_steps`,
  storage stays separate - a repeating list can't fit `dpp_values`'s
  one-scalar-per-field-per-level shape) can still get a
  `field_definitions` row and participate in the same section/
  category/sort_order/consumer_visible configuration as every other
  field, with the admin UI showing "Edit here links out to where
  they're managed" instead of an inline textarea.
- **Searchability at scale.** ✅ GTINs tab pagination done (2026-09-16)
  — user pointed at a real jeans size matrix (waist × length, dozens of
  combinations) as concrete proof this wasn't hypothetical. Added
  `LIMIT`/`OFFSET` (50/page) + a Prev/Next control that preserves
  `search`/`style`/`variant` query params, and a `COUNT(DISTINCT g.id)`
  query reusing the same `WHERE` conditions for the total. Verified by
  temporarily dropping the page size to 5 and confirming page 1/2
  return disjoint rows. ✅ Batches tab search added (2026-09-16) —
  matches the batch's own visible data (Batch ID, Production Order),
  not just the Style filter, per user feedback. ✅ SGTINs tab search +
  pagination done (2026-09-20) — the GTINs tab pagination this section
  describes was itself later removed when Products replaced it, so
  this was rebuilt fresh from this note's description rather than
  copied from a still-live route: search matches serial_number/gtin/
  item_number/batch_id/style_number, LIMIT/OFFSET 50/page, Prev/Next
  preserving `search` (the pre-existing `?gtin=` filter from
  gtin-detail.ejs composes with both unchanged).
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
- **Audit hardcoded columns vs dynamic fields (2026-09-20).** Found and
  fixed one real duplication already (`batches.country_of_production`
  vs the dynamic `country_of_origin` field, done earlier). Audited the
  rest of `db/init-v2.js` against the live `field_definitions` table:
  - ~~**Migration candidates**~~ ✅ Done (2026-09-20): `batches.supplier`
    (`eu_required`), `batches.factory` (`eu_required`), `gtins.color`
    (`nudie`, per explicit decision - factory/supplier are traceability
    facts like country_of_origin, color is plain product description).
    Guarded migration creates the three `field_definitions` rows and
    backfills `dpp_values` from the existing columns (batch 1's factory
    "Cambodia" confirmed carried over) - the old columns stay in the
    schema (real data, unlike `ean`/`weight`), just no longer read.
    Removed the now-duplicate raw-column display in `dpp-passport.ejs`'s
    Production section, `passport-page-service.js`'s JSON
    `manufacturing.factory`/`product.color`, and `batch-detail.ejs`'s
    Batch Information card - all three now render generically wherever
    `country_of_origin` already did (EU Required Information / Nudie
    Information sections, no template changes needed there). Supplier/
    Factory removed from the "+ Add Batch" form - set via DPP Field
    Values after creation, consistent with every other field.
  - **Stay columns** (structural/operational, not DPP content):
    `batches.production_order` (a PO reference key), `gtins.size_value_1/2/3`
    (functions as SKU identity alongside `item_number`, though it IS
    shown to consumers - flagged as borderline, see below),
    `styles.product_type_id` (the FK driving GS1 scheme selection).
  - **Needs its own decision, not a field-system question**:
    `gtins.variant` (free-text column) looks like leftover duplication
    against the real `variants` table/`variant_id` FK, not against
    `dpp_values`. `gtins.product_type` similarly looks like leftover
    duplication against `styles.product_type_id`. `styles.product_type`
    (text) is already mid-migration to `product_type_id` via the
    existing backfill in `db/init-v2.js` - a separate, already-in-
    progress cleanup, not part of this field-system question.
  - ~~`gtins.ean`~~ ✅ Dropped (2026-09-20) - user caught what this
    audit missed: `gtins.gtin` already **is** the EAN (CLAUDE.md treats
    GTIN/EAN as the same identifier, confirmed by real data), and the
    public JSON export's `identifiers.ean` already derived from
    `gtin.gtin`, not this column. Never populated (always NULL), never
    read back - not a field-system question at all, just a redundant
    column. Column dropped via a guarded migration in `db/init-v2.js`,
    removed from `repositories/gtins.js` and `import-service.js`.
  - ~~`gtins.weight`~~ ✅ Dropped (2026-09-20) - confirmed dead the same
    way: only ever written by CSV import, never read back anywhere.
    User confirmed it should go too. Same guarded-migration treatment,
    also removed from `import.ejs`'s documented CSV columns/sample
    (which still listed both `ean` and `weight`).
  Still open: the `gtins.variant`/`product_type` duplication questions
  above (against `variants`/`product_type_id`, not the field system).
- **Role-based field visibility - superseded (2026-09-20), see
  "Extended authority/recycler view" under "Platform vision" instead.**
  This entry originally proposed a public, no-login role selector
  (Customer / Customs / NJ) on the passport itself - **explicitly
  contradicts** the confirmed direction from the platform-vision
  discussion: authority/recycler access must be a separate
  authenticated path, never a public self-service toggle (this was
  already COMPLIANCE.md's own conclusion, gap #7, re-confirmed
  2026-09-20). Kept here only as a record of the rejected alternative -
  the `field_definitions.authority_visible` boolean design under
  "Platform vision" is the current plan.
- ~~**No admin UI to create a new Style at all.**~~ ✅ Done
  (2026-09-20). Found while auditing the Batch/Variant/GTIN/SGTIN gaps
  below - not previously tracked here, since `POST /api/admin/styles`
  already existed and worked; only old v1's `admin-edit.ejs` had a "+
  Add Style" button, wired to v1's own routes, so v2's hub had no
  create path at all for the root of the hierarchy. Added a "+ Add
  Style" toggle form to the Products tab, same pattern as Field
  Config's "+ Add Field".
- ~~**No admin UI to create a new Batch at all.**~~ ✅ Done
  (2026-09-20). The only `INSERT INTO batches` had been old v1 code in
  `routes/api.js` (different schema entirely) and seed scripts -
  `repositories/batches.js`'s `create()` was already correct but
  unused. Added `POST /admin-v2/batch` and a "+ Add Batch" toggle form
  on the Batches tab (rejects a missing/duplicate `batch_id` up front).
- ~~**No admin UI to create a new Variant at all.**~~ ✅ Done
  (2026-09-20). `repositories/variants.js` had no `create()` method at
  all. Added it plus `POST /api/admin/styles/:styleId/variants` and an
  always-visible "Variants" card on `style-detail.ejs` (previously
  hidden entirely for a Style with zero variants, so there was no way
  to add the first one). `product_name` is enforced as a **required**
  form field per the 2026-09-16 decision below, even though the column
  stays nullable.
- ~~**No admin UI to create a new GTIN at all.**~~ ✅ Done (2026-09-20),
  **manual form since removed (same day)** - found during the same pass
  as Batch/Variant above, `gtins.create()` was correct but unused, so
  added `POST /api/admin/styles/:styleId/gtins` and a "+ Add GTIN" form
  on `style-detail.ejs`. User then clarified: "Add GTIN kommer komma
  externt så behövs nog inte där" - GTIN creation is meant to come from
  an external system (PIM/M3), not manual admin entry, so the form was
  a dead end. Removed the button/form/JS handler; the route itself is
  left in place as a plausible future integration point. The "GTINs"
  card on `style-detail.ejs` is now read-only and only renders when
  there's a direct-under-Style GTIN to show.
- ~~**SGTIN serial number generator doesn't exist.**~~ ✅ Done
  (2026-09-20). Also fixed in passing: `repositories/sgtins.js`'s
  `create()` never actually inserted `batch_id` despite the column
  being `NOT NULL` - any real call would have thrown; added it as a
  required parameter. Added `getMaxSerialForGtin()` (highest serial a
  GTIN has ever used across every batch, per **Format (user,
  2026-09-19)** below - never restart at 1 and risk a real collision)
  and `POST /admin-v2/batch-gtins/:id/produce-sgtins`, with a "+"
  action per GTIN row in the Batch Contents tree.
  **Format (user, 2026-09-19)**: 4 digits (`0001`-`9999`) is too short
  a ceiling for real production volumes - use at least 5-6 digits
  (`00001`-`99999` or `000001`-`999999`), zero-padded. Demo data
  seeded this session still uses 4-digit serials (`0001` etc.) - fine
  for now since it's just placeholder data; the real generator (built
  above) uses 6 digits, not inheriting that width.
- **Economic operator / "Legal Responsibility" - direction not
  decided, UI fully removed for now (2026-09-19).** User: "we're
  responsible for all our products" - in reality there's one operator
  (Nudie Jeans AB) that applies to virtually the whole catalog,
  confirmed by the data (only one row exists). First the per-Style/
  per-Batch "Legal Responsibility" assignment card was removed
  (confusing as its own concept for what's really just one value), then
  - "jag förstår inte fältet" - the Settings > Economic Operators
  management page itself was removed too (sub-nav link + content
  block). The `economic_operators` table, repository, and the
  GET/POST/PUT/DELETE `/operators` API routes are untouched - no UI
  surface references the concept anywhere in admin right now, but
  nothing is deleted. Two directions floated, not decided:
  (a) turn it into a plain custom field (`field_definitions`/
  `dpp_values`, editable like any other field, no separate table), or
  (b) keep it purely as a single global Settings-level default with no
  per-product assignment at all (closer to the `is_default`-flag plan
  originally sketched here). Needs a decision before either is built.

- **Simplify language/locale handling - closed, no change needed
  (2026-09-19).** User initially flagged this needed simplifying
  ("vi behöver förenkla språkhanteringen"); asked what specifically
  felt complex about the current per-level `(field_definition_id,
  entity_type, entity_id, locale)` scoping (`fields.js`) and its
  per-entity "Language: Default | + add locale" tab bars. Answer:
  "Språkhanteringen kan vara kvar" - leave it exactly as it is. Not a
  follow-up item.
- **Database cleanup - partially done (2026-09-20).** `data/dpp-v2.db.stale-backup`
  deleted (confirmed superseded by the live, actively-updated
  `data/dpp-v2.db`). `data/dpp.db.stale-backup` **deliberately left
  untouched** — investigating it surfaced that `data/dpp.db` itself
  (the path v1's own `src/db.js`/`scripts/seed.js` expect) doesn't
  exist on disk at all, only this stale-backup copy of it. Per CLAUDE.md
  §22.6 (never rename/delete v1's data without explicit approval) this
  needs the developer's own call, not an autonomous cleanup decision -
  user confirmed v1's data isn't a current priority, so it stays as-is
  for now rather than being restored or deleted.
  Still open: the hardcoded-columns audit, and a pass over
  `data/dpp-v2.db` for leftover test/seed cruft from manual curl
  testing (e.g. placeholder economic operator/test rows from Phase 4).
  Also found and attempted to fix in this pass: the known orphaned
  `batch_gtins` row (id 1, `gtin_id` 1 no longer exists in `gtins`,
  confirmed nothing else references it) - the delete was blocked by the
  environment's own destructive-action safeguard, so the row is still
  there; needs the developer to run it directly:
  `DELETE FROM batch_gtins WHERE id = 1 AND gtin_id = 1`.

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
- Resolution precedence, per explicit decision (as of 2026-09-16 -
  since extended twice more, see the Batch×Style/Batch×GTIN sections
  above for the current full chain): **SGTIN > GTIN > Batch > Variant
  > Style**. Verified with real overrides: a GTIN-level value beat a
  Variant-level one, and the existing Batch-level `country_of_origin`
  override still beat Variant, exactly as decided.
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
existing dynamic field system fine (new `field_definitions` rows), and
get inheritance/override/locale/lock for free that way. **Corrected
2026-09-20**: originally said category `environmental` here too - same
`category`-overload mistake fixed in Phase 5 above. These should be
`category='eu_required'` with a `field_sections` entry (e.g.
"Environmental Footprint") for their grouping, once that mechanism is
built - not a new `category` value.

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

**Update (2026-09-20)**: the first real auth on a v2 route now exists -
not a dedicated route, but the public passport route itself
(`/01/:gtin/21/:serial`, `?role=<key>`), which enforces a role's
`requires_auth` flag at render time when set ("Digital Access", see
"Platform vision" above). No role has `requires_auth` on by default
today, so in practice nothing is gated yet - the mechanism exists,
switched off. Every `/admin-v2/*` and `/api/admin/*` route is still
completely open, as described above - this is one narrowly-scoped
exception, not the start of hardening the admin API generally.

## Known bugs found during this work (fix opportunistically)

- ~~`repositories/sgtins.js`'s `create()` method omits `batch_id` from
  its `INSERT`~~ - **checked 2026-09-20, already fixed**: the
  `produce-sgtins` admin flow built later in this session
  (`routes/admin/batch-gtins.js`) already calls `create(gtinId,
  batchId, serialNumber, options)` with `batch_id` correctly included
  in the INSERT. This note was stale.
- ~~**Orphaned `batch_gtins` row**~~ (found 2026-09-19 while building
  the Batch tree) - **fixed 2026-09-20**: `batch_gtins.id=1` (batch 1
  → `gtin_id=1`, which no longer existed in `gtins`) was a dangling
  foreign key, likely left over from earlier demo-data cleanup. Deleted
  after confirming no `dpp_values` or `field_change_log` rows
  referenced it; Batch page and hub verified to still render correctly.

## GTIN detail page was hiding non-GTIN-editable fields entirely ✅ Done (2026-09-20)

Same class of bug as the Batch scoped-field editor fix above ("man
vill ju se alla fält" - see the follow-ups under the Batch section) -
user's screenshot of the GTIN detail page and "Det känns inte som alla
fält syns" (doesn't feel like all fields show) pointed at the same root
cause: the GTIN detail route used the narrow
`fieldRepository.getFieldsForLevel('gtin', gtinId, locale)`, which only
returns fields with `editable_at_gtin=1`. Any field only editable at
Style/Variant (Carbon Footprint, Water Usage, Story, Transport) was
silently absent from the page instead of showing as inherited/locked.

Unlike the Batch case, no new resolver method was needed -
`resolveGtinPassport(gtinId, locale)` already existed and already
resolves full inheritance (GTIN > Variant > Style), just wasn't used by
the live admin route. Rewired `routes/admin/hub-v2.js`'s
`GET /gtin/:gtinId` to call it, and extended
`_resolveFieldValueLocaleAware()` (the shared helper behind
`resolveGtinPassport`/`resolveSgtinPassport`/`resolveBatchPassport`/
`resolveStylePassport`) with an optional `editableColumn` parameter so
resolved fields carry an `editable` flag - only the GTIN call site
passes `'editable_at_gtin'` for now; the other three still default to
`editable: true` since nothing downstream uses it there yet.
`views/admin/gtin-detail.ejs` now shows non-GTIN-editable fields as a
locked, read-only line (with a note pointing at Field Config › Levels)
instead of hiding them, in both View and Edit mode.

Verified end-to-end: GTIN 20 (under Loud Larry, style 9) now shows
Carbon Footprint/Story/Transport correctly as "Inherited from Style"
in View Mode and locked in Edit Mode; a genuinely GTIN-editable field
(Color) still renders as an editable textarea and still saves via
`POST /gtin/:id/dpp-values`; full regression sweep green (hub, Products
tab, gtin/9, style/9, public JSON passport all unaffected).

**Same bug also affected Variant and SGTIN admin detail pages** - both
used the same narrow `getFieldsForLevel(level, id)` pattern. Confirmed
and fixed the same day - see "Variant and SGTIN detail pages were
hiding non-editable fields entirely" below.

## Variant and SGTIN detail pages were hiding non-editable fields entirely ✅ Done (2026-09-20)

Follow-up to the GTIN detail fix above, confirmed via direct code
inspection rather than a fresh user report: both routes used the exact
same narrow `getFieldsForLevel(level, id)` query.

- **Variant**: no resolver method existed for the Variant masterdata
  page, so added `resolveVariantPassport(variantId, locale)` to
  `passport-resolver.js` (Variant > Style, same shape as
  `resolveGtinPassport`), and rewired `routes/admin/hub-v2.js`'s
  `GET /variant/:variantId` to use it. Checked against the live data:
  every `field_definitions` row happens to have `editable_at_variant=1`
  today, so this fix doesn't change what's currently visible on any
  real Variant page - it's a real correctness fix for whenever a
  Variant-only-restricted field is added, not a visible change today.
- **SGTIN**: `resolveSgtinPassport()` already existed (it's what the
  public passport uses) but two things were missing: the admin route
  was hand-building the same 8-level inheritance chain itself via
  `getFieldsForLevel('sgtin', ...)` plus seven separate value-map
  lookups instead of calling the resolver, and the resolver's own
  `_resolveFieldValueLocaleAware` call for SGTIN never passed
  `'editable_at_sgtin'` (the `editable` flag parameter added for the
  GTIN fix), so it always defaulted to `editable: true`. Fixed both -
  `routes/admin/hub-v2.js`'s `GET /sgtin/:sgtinId` now just calls
  `resolveSgtinPassport()` and maps its `resolvedFields`, a net
  simplification as well as a bug fix.
- Both `views/admin/variant-detail.ejs` and `sgtin-detail.ejs` gained
  the same View/Edit mode treatment as GTIN detail: a genuinely-unset,
  non-editable field shows "Not editable at [level] level" instead of
  the generic "fill this in" message, and Edit Mode shows a locked line
  (with current value, if any) instead of an editable textarea.

Verified: SGTIN has several `editable_at_sgtin=0` fields
(`sustainability_info`, `repair_program`, `carbon_footprint`,
`transparency`, `transport`, `additional_story`,
`secondhand_program`) that were completely invisible on SGTIN detail
before this fix - confirmed sgtin/2 (under style 3, which has
Style-level values) now shows Carbon Footprint and Transparency
correctly as "Not set anywhere - not editable at SGTIN level", and
Repair Program (which already had a pre-existing SGTIN-level override
value from before this fix existed) correctly shows that value in View
Mode while Edit Mode locks it from further changes. Confirmed a
genuinely SGTIN-editable field (Color) still saves correctly via
`POST /sgtin/:id/dpp-values`, cleaned up the test value afterward. Full
regression sweep green (all Variant/SGTIN pages, hub, public passport
HTML unaffected).

## Configurable passport sections ✅ Done (2026-09-20)

User's next piece of passport feedback: the Transparency section had
briefly shared its icon with Production by copy-paste mistake (fixed
separately, see icon note above), and separately flagged the "EU
Required Information" heading itself as "lite konstigt" - asked
whether it should just be renamed, or whether headings/field-to-section
assignment should be manageable from Settings. Given the choice, opted
for the real feature (this is Phase 8 in CLAUDE.md's plan) rather than
a one-off rename.

**Built**: a `field_sections` table (`section_key`, `label`, `icon`,
`sort_order`) and `field_definitions.section_id`, replacing the three
headings ("EU Required Information" / "Transparency" / "Nudie
Information") that used to be hardcoded straight into
`dpp-passport.ejs`. A guarded startup migration
(`migrateFieldSections` in `db/init-v2.js`) seeds the 3 existing
sections at their current order/icon and backfills `section_id` from
each field's existing `category` - checking `field_key = 'transparency'`
first so it lands in its own section rather than `eu_required` - and
only ever fills a `NULL` `section_id`, so a section an admin has
already picked in Field Config is never overwritten by a later restart.

**Icon storage is a validated key, not raw markup**: `icon` is one of a
small curated set of Lucide icon names (`utils/section-icons.js` - reads
the same `lucide-static` package `utils/icons.js` already uses, strips
each SVG down to just its inner `<path>`/`<circle>` markup so the
passport's own `.icon` CSS class controls stroke-width/color). The
admin API still has no authentication at all (see the Security note
below), so accepting free-form SVG/HTML from that endpoint would be an
open injection point on a page every consumer loads - deliberately
avoided rather than deferred.

**Resolver/service changes**: `passport-resolver.js`'s
`_resolveFieldValueLocaleAware()` now includes `sectionId` on every
resolved field (alongside the `editable` flag added for the GTIN
fields fix above). `passport-page-service.js`'s new
`buildPassportSections()` does the actual grouping - CLAUDE.md says no
business logic inside EJS templates, so this moved out of
`dpp-passport.ejs` rather than being reimplemented there. It
special-cases two things that were never ordinary fields to begin
with: Transparency (a `data_type='repeating_group'` field with no
`dpp_values` row of its own - its section is driven by
`supplyChainGroups` instead) and the economic operator block (a real
compliance requirement, not a dynamic field, pinned into whichever
section has `section_key = 'eu_required'`). `dpp-passport.ejs` now
renders one generic loop over `passportSections` instead of three
copy-pasted accordion blocks.

**Settings UI**: Field Config gets a new "Passport Sections" panel
above the fields table (add/edit/delete - delete refused while any
field is still assigned, same "clear references first" convention as
deleting a field definition) and a Section dropdown on both the field
add form and each field's inline edit form, plus a Section column on
the fields list.

Verified: renaming a section via `PUT /api/admin/fields/sections/:id`
updates the live passport immediately (no server restart needed -
EJS templates re-render per request); deleting a section with fields
assigned is refused with a clear error; after the migration every
existing field kept its exact prior grouping and section order
(checked via a direct SQL dump); full regression sweep green (both
test passports' HTML, the JSON export - unaffected, still keyed off
`category` directly - GTIN/Style admin detail pages, and the hub).

## Field validity window (valid_from/valid_until) ✅ Done (2026-09-20)

Prompted by a design question: "Om vi har haft ett fält som vi vill
skall försvinna på nya productpass då det inte längre är nödvändigt" -
a field that's no longer needed should stop appearing on new passports,
without retroactively changing passports for garments already produced.
User confirmed the key design decision explicitly: "Om det inte finns
några datum så är det alltid giltigt" (no dates = always valid).

`field_definitions.valid_from`/`valid_until` already existed in the
schema - CLAUDE.md's original field_definitions design suggested them -
but nothing ever read or wrote them. Wired them through
`createFieldDefinition`/`updateFieldDefinition` in `repositories/fields.js`,
the admin API routes (`routes/admin/fields.js` - an empty string clears
to `NULL`, same convention `section_id` already uses), and a new
`passport-resolver.js` helper, `_isFieldValidForDate(fieldDef,
productionDate)`, which filters `field_definitions` before resolving a
passport.

**Deliberately keyed off the Batch's `production_date`, not "today"** -
a passport must keep showing what was true when the garment was
actually made; changing based on today's date would mean an
already-produced garment's passport silently mutates over time, which
is wrong. A batch with no `production_date` yet (not produced) always
shows every field regardless of its validity window - there's no fixed
date to check against, and that passport isn't final either way.

**Scope**: only wired into `resolveSgtinPassport` (the public-passport
path, used by both the GS1 Digital Link route and the legacy `/dpp/`
route via `passport-page-service.js`). Deliberately NOT applied to
`resolveGtinPassport`/`resolveBatchPassport`/`resolveStylePassport` -
the admin detail pages should keep showing every field regardless of
date, since an admin may need to set or inspect data for a field that's
about to expire, or one that's not valid yet.

**Settings UI**: Field Config's Add Field form and each field's inline
edit form get "Valid From"/"Valid Until" date inputs (a `hint-panel`
explaining the production-date semantics, matching the panel style
already used for Roles/Levels), and a new "Valid" column on the fields
list (shows the date range, or "Always").

Verified: set `fiber_composition`'s `valid_until` to a date before
batch `PO45001234`'s `production_date` (2024-01-15) - the field
disappeared from that batch's SGTIN's HTML passport AND its `/json`
export; the Loud Larry batch (no `production_date` set) still showed
it; the admin GTIN detail page was unaffected either way; clearing the
date restored it everywhere immediately. Full regression sweep green.

## External API / integration access ⏳ Not built (backlog, raised 2026-09-20)

User's framing: "vi behöver apier eller GraphQL för allt som då det
mesta kommer komma externt" (we need APIs or GraphQL for everything,
since most data will come from external systems) - this session has
repeatedly removed manual "+ Add" UI (GTIN, Variant, produce-SGTINs)
specifically because that data is meant to arrive from other systems
(M3/PIM/PLM/QC/etc, per CLAUDE.md's `source_system` design) - but no
real API surface exists yet for those systems to actually write
through. Concretely still missing:

- A documented, authenticated write API (REST and/or GraphQL) covering
  at minimum: create/update Style, Batch, GTIN, Variant; produce
  SGTINs; set DPP field values at any level; add lifecycle events -
  the same operations this admin UI already does internally, exposed
  for external callers instead of only a logged-in browser session.
- **Dynamic fields must be visible in the API automatically**: when an
  admin adds a new field in Field Config, it should be readable/
  writable through the API without a code change - the API needs to
  read from `field_definitions` at request time the same way the admin
  UI and passport resolver already do, not hardcode a fixed field list.
- **Access control**: external systems need to request access and
  receive a token (API key or OAuth-style token) scoped to what they're
  allowed to read/write - user asked "Det antar jag ligger under
  settings med?" (I assume that belongs under Settings too?) - agreed:
  a new Settings sub-tab (e.g. "API Access", alongside Field Config /
  Digital Access / Product Types) to issue, view, and revoke tokens,
  most likely per `source_system` value (`m3`, `pim`, `plm`, `qc`, ...)
  so every write is already attributable without extra bookkeeping.

Not scoped or designed in detail yet - this is a placeholder for a
real design pass (auth mechanism, rate limiting if any, which
operations are exposed, REST vs GraphQL vs both) before building
anything. Given this POC's existing security posture (admin API has no
auth at all today - see the Security note above), a real external
write API is also the first place where skipping authentication would
stop being acceptable, even for a POC.

## GS1 Scheme wired to real behavior (partial) ✅ Done (2026-09-20)

The `gs1_scheme` dropdown under Settings > Product Types (`batch_gtin_sgtin`
/ `batch_gtin` / `gtin_sgtin`) had existed since the GS1 hierarchy design
(2026-09-19) but was purely decorative - nothing read it. User asked
directly ("Visas detta utifrån detta? Är detta efter det man har
satt?") and, once confirmed, chose to build only the smaller, isolated
half of this now.

**Built**: `productTypeRepository.getSchemeForStyle(styleId)` (a
`styles.product_type_id` → `product_types.gs1_scheme` LEFT JOIN,
defaulting to `batch_gtin_sgtin` when unset - matches the only
behavior that existed before this column did, so no existing passport
changes unless a scheme is deliberately set). `resolveSgtinPassport()`
now checks this per-request: for `gtin_sgtin` ("Individual units, no
Batch") it drops Batch/Batch×GTIN/Batch×Variant/Batch×Style from the
inheritance chain and from economic operator resolution, leaving
SGTIN > GTIN > Variant > Style - the Batch row itself is still loaded
(its `production_date` still drives the field-validity window, and
`passport.batch.*` is read elsewhere). `produce-sgtins` now refuses
with a 400 for `batch_gtin` ("Batch + GTIN, no individual units"),
since that scheme has no per-garment serialization at all.

**Not built (separate, larger follow-up)**: a real public passport for
`batch_gtin` products needs its own GTIN-only route and render path
(no SGTIN exists to resolve against) - `dpp-passport.ejs`, scan
logging, and `passport_versions` all currently assume a resolved
`sgtin`/`batch`. Deliberately deferred - user chose the small half
first specifically to avoid touching the currently-working
`batch_gtin_sgtin` path while building a much bigger, riskier piece.

**Follow-up, also done (2026-09-20)**: user noticed the Product Types
description text itself ("Controls which levels make up a product's
identifier/QR code") promised Batch is part of the *identifier* for
"Full hierarchy (Batch + GTIN + SGTIN)" - but the GS1 Digital Link URL
never actually included it (GTIN + serial alone already uniquely
identify an SGTIN, so it was left out entirely). Rather than soften the
description, built the real thing: `utils/gs1-link.js`'s
`buildDigitalLinkPath()` now includes Batch as GS1 AI 10
(`/01/{gtin}/10/{batch}/21/{serial}`) for `batch_gtin_sgtin`, and
leaves it out for `gtin_sgtin` (matching that scheme's own "no Batch"
name). `routes/gs1.js` gained the matching `/01/:gtin/10/:batch/21/:serial`
route (+ `/json`) alongside the existing batch-less one, which keeps
working for any code already issued without it - the batch segment is
validated against the SGTIN's actual batch (`sgtinBatchMatches()`), so
a wrong/stale batch in a URL 404s instead of silently resolving anyway.
The admin SGTIN detail page and the SGTINs tab list both build their
links through this same helper now, so they can't drift from what the
live public route actually expects.

Verified against real data (GTIN 3 / style 3, Jeans): a Batch-only
value (Factory) disappeared from the live passport when switched to
`gtin_sgtin`, while a value that happened to also exist at GTIN level
(Sustainability) correctly kept showing via that level instead;
`produce-sgtins` correctly refused under `batch_gtin`. Reverted after
testing; default scheme behavior confirmed unchanged via before/after
comparison.

## Test Scan tool should live under Settings ⏳ Not built (2026-09-20)

Re-confirms and adds a UI placement decision to the "Test scan a
passport" tool already designed above (see "Soft/lazy SGTIN creation
on first scan..." - full design, input fields, and the geolocation
legal note are there, unchanged, still not built). User: it should be
its own Settings sub-tab (alongside Field Config / Digital Access /
Product Types / the not-yet-built API Access below), not a standalone
page reached some other way.

## Admin Hub role-based access control (RBAC) ⏳ Not built (2026-09-20)

A distinct concept from **Digital Access** (which controls what a
*consumer* sees on the *public passport*, per role - already built).
This is about who can access *this admin Hub itself*, and what they
can do once in.

User's concrete shape for it:

- A new Settings sub-tab, under **Access** alongside Digital Access
  (not replacing it - the two answer different questions: "what does
  a passport viewer see" vs "what can an admin user do here").
- **Roles gate which admin *sections* a user can reach**, at minimum:
  - **Field Admin** - access to Field Config and Product Types only.
  - **Super Admin** - everything Field Admin has, plus Digital Access
    and the not-yet-built API Access (see the external API backlog
    item above) - i.e. Super Admin is a strict superset.
- **Separately, a Viewer/Editor permission level** cuts across
  whichever sections a role can reach - Viewer can see a section's
  data, Editor can change it. This is a second, orthogonal dimension
  from the role (which sections) - a Field Admin could be a Viewer or
  an Editor of Field Config, for example.

Not scoped or designed in detail yet: how roles/levels map onto actual
user accounts (this POC's `users` table and auth - see the Security
note above, admin currently has no real auth at all), and how a role
name here relates to a Digital Access role name (`consumer`,
`authority`, `recycler`, ...) - they are conceptually unrelated
systems that happen to reuse the word "role"; worth choosing distinct
terminology when this is designed for real, to avoid the two being
confused in the UI. This is a real prerequisite for the "no auth at
all" Security note above to ever be closed out properly, not just a
nice-to-have permissions layer.
