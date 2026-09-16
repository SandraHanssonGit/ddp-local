# Changelog

Session-level log of changes to `dpp-v2-local`, kept in addition to git
history because several changes here are fixes to bugs discovered
during manual review, not obvious from a commit message alone.

## 2026-09-16 (etapp 7) — Login page: password field width bug

- Real bug the user spotted: the Password input rendered at browser
  default width, much narrower than Username. `admin.css`'s shared
  input styling rule listed `input[type=text/number/date/url]` but
  never `input[type=password]`, so it fell back to unstyled browser
  defaults. Added `password`, `email`, and `file` to the same rule -
  the last one also fixes the (previously unstyled) image upload
  inputs on the Style/Variant detail pages.
- Trimmed the footer to "Nudie Jeans" (was "Nudie Jeans · Digital
  Product Passport" - redundant under a page already titled "DPP Hub").

## 2026-09-16 (etapp 6) — Login page: label bug + copy fix

- Removed "New Architecture" line from the login card - internal
  dev-note copy that had leaked onto a user-facing page.
- Fixed a real bug the user spotted: `label` had no `display` set in
  `admin.css`, so it defaulted to inline. On the login page this made
  the Password label sit inline next to its input (Username happened
  to wrap onto its own line only because its longer label text pushed
  the width:100% input down - not a real fix, just lucky wrapping).
  Set `label { display: block; margin-bottom: 6px; }` globally -
  `.checkbox-row` labels are unaffected since a class selector already
  overrides the bare element rule with `display: flex`.

## 2026-09-16 (etapp 5) — Supply Chain: collapsible sub-categories

User feedback on the consumer passport's Supply Chain section (style
113756's real 7-category, 19-step data): once the section itself was
expanded, every category (Raw Material, Yarn Process, Trims, ...) was
always fully shown with no way to collapse individual ones - long list
to scroll through. Each category is now its own nested accordion
(`.sub-accordion-header` + `.accordion-content.sub`). Also extended the
rounded hover-highlight from etapp 4 to both the outer section headers
and the new per-category headers, for the same "kritiker.se" hover
feel.

Follow-up per user feedback: default state flipped to collapsed (first
shipped open) - with 7 categories the fully-open list was exactly the
long scroll this feature was meant to fix.

## 2026-09-16 (etapp 4) — Nav hover: rounded highlight (kritiker.se)

User pointed out that DESIGN_SYSTEM.md's "modeled on kritiker.se" nav
claim wasn't fully true in code - the admin hub's tab bar only had a
plain underline-on-active, none of kritiker.se's rounded hover
highlight/active pill. Fixed the specific thing asked for (the hover
highlight), not a full icon+pill nav rebuild:
- `.admin-nav a` - rounded pill padding, `--surface-2` background on
  hover, `--accent-soft` pill on the active tab (was a bare
  border-bottom).
- Added matching hover transitions to `.filter-pills` and
  `.locale-tabs` (DPP Fields category filter, language tabs) for
  consistency - same pill family, same interaction.
- Added the same hover state to the consumer passport's `.lang-link`
  language switcher, which had none before.

## 2026-09-16 (etapp 3) — Admin visual redesign: login page

- Rewrote `views/login-v2.ejs` onto `public/css/admin.css` - Nudie
  logo, Archivo/Work Sans, brand card styling over the existing
  `nudie-background.jpg` store photo (kept, just darkened with a
  gradient overlay for text contrast). Same login flow/JS unchanged,
  verified `POST /api/login` still returns a token.

## 2026-09-16 (etapp 2) — Admin visual redesign: detail pages

- Extended `public/css/admin.css` with detail-page components: 2/3+1/3
  layout (`.detail-grid`), 3-state DPP field cards (`.field-card` —
  overridden/inherited/not-set), image upload boxes, locale tabs,
  supply chain step list, inline progress bars (batch planning),
  callout boxes.
- Rewrote all 5 detail pages onto it: `style-detail.ejs`,
  `variant-detail.ejs`, `batch-detail.ejs`, `gtin-detail.ejs`,
  `sgtin-detail.ejs`. Same forms, same JS, same routes - visual only.
  (`gtin-detail.ejs` and `sgtin-detail.ejs` were previously
  single-line minified HTML; reformatted readably in the process.)
- Verified all 5 render 200 with real data (style 131274/variant B02
  and style 113756's supply chain - 19 steps, UTF-8 intact).
- Etapp 2 closes out the "Admin redesign in progress" item started in
  etapp 1 for the hub + detail pages; field-form.ejs and import.ejs
  still use the old styling.

## 2026-09-16 (etapp 1) — Admin visual redesign: DPP Hub

- New shared `public/css/admin.css` - the Nudie brand tokens/components
  from DESIGN_SYSTEM.md (nav, card, table, badge, button, input, level
  pill, lock banner), light mode only (internal desk tool, no mobile
  layout needed per DESIGN_SYSTEM.md's "Responsive" section).
- Rewrote `views/admin/hub-v2.ejs` (all 7 tabs: Styles, Variants,
  GTINs, Batches, SGTINs, DPP Fields, Scan Analytics) onto it, dropping
  the Tailwind CDN utility classes for the new component classes.
  Behavior/markup structure otherwise unchanged - same forms, same JS,
  same routes.
- Verified every tab renders 200 with no server-side errors (minted a
  local JWT to test without needing the real login password).
- Scoped as etapp 1 of the admin redesign - detail pages (Style/
  Variant/Batch/GTIN/SGTIN, field-form, import) still use the old
  Tailwind styling; follow-up commits will move them onto
  `admin.css` the same way.

## 2026-09-16 (no really, final) — JSON export: version + full supply chain

- The public `/json` passport export was missing the "as of when" info
  needed for a machine consumer (registry/API pull) to know how fresh
  the data is, and didn't include the new Supply Chain section at all.
- Added `passportVersion` + `lastUpdated`, sourced from the existing
  `passport_versions` table (already tracked per SGTIN write, just not
  exposed anywhere) rather than building a new change-log export -
  full audit history (`field_change_log`) stays admin-only, per the
  earlier decision that a consumer/API-facing passport shows current
  state + freshness, not a change log.
- Added `supplyChain`, using the exact same
  `supplyChainRepository.getGroupedForEntity()` grouping as the HTML
  passport, so JSON and HTML can't drift apart.
- Added `product.imageUrl` (variant image falling back to Style).
- Verified against style 113756: `passportVersion: 1`, 19 supply chain
  steps across 7 categories, UTF-8 intact (Söke).

## 2026-09-16 (absolutely final) — Supply Chain data structure

- New `supply_chain_steps` table - a repeating list of named process
  steps (Raw Material, Spinning, Weaving Mill, Thread Supplier, ...),
  each with a supplier (name/city/country/employee range/"visited"
  flag). Deliberately separate from `field_definitions`/`dpp_values`,
  which only holds one scalar value per field per level and can't
  represent a repeating structured list. The old (pre-this-session) v1
  schema actually had a `transparency_data` table with JSON columns
  for the same purpose, dropped when v2's simpler field model was
  built - noted for context, not reused (a normalized table fit v2's
  style better).
- New `repositories/supply-chain.js` + CRUD routes in
  `routes/admin/hub-v2.js`. New "Supply Chain" card on the Style admin
  page (add/view/delete, grouped by category) and a matching section
  on the public consumer passport, placed after Production.
- Seeded real reference data for style `113756` (Tuff Tony Dry
  Selvage) via `scripts/seed-supply-chain-113756.js` - 19 real supply
  chain steps pulled from the live nudiejeans.com product page, used
  to visually verify the new section against the real site. Verified
  UTF-8 renders correctly for non-ASCII names (Söke, Türkiye, Berning
  +Söhne, Borås) - seeded via a Node script rather than shell
  arguments specifically to avoid encoding corruption.
- Verified end-to-end on both the admin page and the public passport
  (GS1 URL); full regression sweep across every existing admin page
  and both passport routes (GS1 + legacy) confirmed unaffected.

## 2026-09-16 (truly final) — Visual redesign: consumer passport in code

- Rewrote `views/dpp-passport.ejs` to the approved Nudie brand language
  (DESIGN_SYSTEM.md): real logo (cropped with the exact pixel math
  worked out for the design canvas), Archivo/Work Sans, warm
  light/charcoal dark tokens, hand-drawn Lucide-style section icons,
  hairline dividers - one responsive template (not a separate mobile
  page) that adapts at 640px.
- **Adapted rather than copied the mockup's content**: the design
  canvas used illustrative demo content (CO2/water stats, named supply
  chain partners) that doesn't exist as real data yet - the real page
  applies the visual language to the actual sections (EU Required,
  Nudie, Production, Lifecycle Events, Scan History, Identifiers)
  instead of fabricating fields that aren't there. Also skipped a
  "Responsible manufacturer" footer the mockup had, since Economic
  Operators (Phase 4) isn't built.
- Real dark-mode toggle (button, `data-theme` attribute + localStorage,
  falls back to `prefers-color-scheme`) - the mockup only showed two
  static light/dark artboards.
- Real language switcher: new `getAvailableLocalesForPassport()` in
  `passport-page-service.js` unions every locale that has a
  translation anywhere across the SGTIN's full chain
  (SGTIN/GTIN/Batch/Variant/Style), rendered as GET-navigated links
  (`?lang=`), consistent with the admin pages' pattern.
- Fixed a small content bug while rewriting: the old template's
  `sourceLabel` mapping (batch/gtin/style) never had an entry for
  `variant` - a Variant-sourced field would have shown the raw string
  "variant" instead of "Variant".
- **Required a CSP change**: `server.js`'s `helmet.contentSecurityPolicy`
  only allowed `cdn.tailwindcss.com` for styles and had no `font-src`
  directive - Google Fonts (`fonts.googleapis.com` for the CSS,
  `fonts.gstatic.com` for the actual font files) would have been
  silently blocked by the browser. Added both.
- Verified end-to-end: page renders (200) with all key elements
  present; CSP header confirmed to include the new domains; logo
  serves; language switcher correctly toggles the `active` state and
  shows the French value when `?lang=fr-FR` is requested, English
  default otherwise; legacy `/dpp/...` route and every admin page
  unaffected.
- **Scope**: only the consumer passport. Admin pages
  (`views/admin/*.ejs`) still use the old generic Tailwind styling -
  next up per the roadmap.

## 2026-09-16 (very final) — DPP Fields tab: Levels + Edit/Delete

- New Levels column (S/V/B/G/SG tags, green/grey) on `/admin-v2?tab=fields`.
- Added an inline Edit row and wired up `DELETE /api/admin/fields/:id`,
  which didn't exist despite the repository method
  (`deleteFieldDefinition`, with its "refuse if values exist" safety
  check) already being written.
- Found and fixed a real bug while touching the PUT route: it
  destructured `req.body` straight into the update object, so any
  field the caller didn't send became `undefined` in the SQL bind
  parameters - sqlite3 throws on that. Now filters to only
  actually-present fields.
- Verified: a partial PUT (one level flag only) leaves every other
  column untouched; delete is refused with a clear error for a field
  that has `dpp_values` attached, succeeds for one that doesn't; ran a
  full create → edit → delete cycle through the same calls the page's
  JS makes.

## 2026-09-16 (final) — Phase 3: GS1 Digital Link

- Planned before coding, per explicit ask: mapped all four UI
  touchpoints that build a passport URL first, to avoid the pattern of
  finding gaps mid-build - `hub-v2.ejs`, `sgtin-detail.ejs` (two
  places), `style-detail.ejs`.
- New `services/passport-page-service.js`: scan logging + resolve +
  render, in one place, called by both `routes/dpp.js` (legacy,
  `/dpp/:batch/:gtin/:sgtin`) and the new `routes/gs1.js`
  (`/01/:gtin/21/:serial`, mounted at root). Deliberately shared, not
  duplicated - the two URLs can't drift on scan tracking, `?lang=`, or
  the JSON export.
- Simpler than the original plan assumed: `sgtins` already has
  `UNIQUE(gtin_id, serial_number)`, so GTIN + serial alone uniquely
  identify an SGTIN - no batch needed in the GS1 URL, no port from the
  archived branch needed either.
- All four admin UI touchpoints updated to show `/01/{gtin}/21/{serial}`
  as the primary link; `sgtin-detail.ejs` keeps the legacy URL visible
  as a secondary, still-working internal link.
- Verified end-to-end: GS1 HTML page and JSON export both work; French
  locale resolves identically on the GS1 URL as it did on the legacy
  one (proves the shared code path); a real before/after scan_events
  count (25→26) confirms scan logging fires on the new route, not just
  a 200 status code; legacy route still works unchanged; every
  previous phase (lock, versioning, locale, variant) still passes.
- Found, not fixed (pre-existing, unrelated): `/dpp/:batch/:gtin/scan`
  is unreachable because Express matches the earlier-registered
  `/:batch/:gtin/:sgtin` route first, treating "scan" as a literal
  serial number. Same route order existed before this session touched
  the file; logged in ROADMAP.md.

## 2026-09-16 (very newest) — Variant architecture fix

- Confirmed against real product requirements: for tops, the product
  *name* differs per variant (e.g. "Raw Hem T-Shirt Black" vs
  "...Navy"), not just the size run - `variants` previously had no
  content fields at all (`styles.style_number` is `UNIQUE` on its own,
  and `variants` only carried `variant_name`, a label).
- Added `variants.product_name` / `variants.image_url` (`NULL` = falls
  back to the style's), and `variant` as a full DPP value level
  (`editable_at_variant` on `field_definitions`, added to
  `field-service.js`/`override-service.js`'s valid entity types).
- Resolution precedence, per explicit decision: SGTIN > GTIN > Batch >
  Variant > Style. Verified with real overrides that GTIN and the
  existing Batch-level `country_of_origin` override both still beat a
  Variant-level value, exactly as decided.
- New `repositories/variants.js`. `variant-detail.ejs`'s edit form
  previously called `PATCH /api/admin/variants/:id`, which never
  existed anywhere in the codebase (a second broken save button found
  this session) - fixed to call the real route
  (`/admin-v2/variant/:id`) and now also saves `product_name`/
  `image_url`. Added a DPP Fields card + language tabs matching the
  other three levels.
- **Bug fixed in passing**: `resolveGtinPassport()` read
  `gtin.batch_id`, a column that doesn't exist (a GTIN can belong to
  several batches via `batch_gtins`) - this method always threw before
  it could ever be reached. Fixed by dropping Batch from the GTIN-only
  chain (now GTIN > Variant > Style) since editing it for Variant
  support anyway.
- **Found, not fixed (separate, pre-existing bug)**:
  `routes/admin/passports.js`'s GTIN route also calls a
  `passportResolver.getResolvedValuesByCategory()` that has never
  existed - confirmed by testing that the route now fails on this next
  bug instead of the batch_id one. Logged in ROADMAP.md, out of scope
  here.
- Verified end-to-end: variant-level override → correct in the public
  JSON export with `source: "variant"`; GTIN-level and existing
  Batch-level overrides both still correctly outrank a Variant value;
  jeans (no variant) SGTINs unaffected; Phase 0/1/2 features (locking,
  versioning, locale) all still working after the change.

## 2026-09-16 (newest) — Phase 2: multi-language infrastructure

- **Schema rebuild, done carefully**: `dpp_values` had
  `UNIQUE(field_definition_id, entity_type, entity_id)` - adding a
  language dimension meant `locale` had to join that constraint, which
  SQLite can't do via `ALTER TABLE`. `db/init-v2.js` now rebuilds the
  table (create new shape → copy data → drop old → rename), guarded by
  checking for the `locale` column first so it only runs once. Backed
  up `data/dpp-v2.db` before running it for real, then verified row
  count and spot-checked values (including `locked_at` timestamps)
  survived identically.
- `repositories/fields.js`: every `dpp_values` method
  (`setDppValue`/`getDppValue`/`getEntityValues`/`getFieldsForLevel`/
  `markValueLocked`/`removeDppValue`) takes an optional `locale`
  parameter (`null` = default, unchanged behavior for every existing
  caller that doesn't pass one). Added `getAvailableLocales()` for the
  admin UI's language tabs.
- `services/passport-resolver.js`: all four `resolve*Passport` methods
  take a `locale` param. New `_resolveFieldValueLocaleAware()`
  implements **language-first, then level** - search every level for a
  translation before falling back to the default chain - per explicit
  decision. Verified with a real cross-level conflict: French set at
  Style correctly overrode English set directly on an SGTIN when a
  French passport was requested, and reverted correctly when no
  language was requested.
- `services/override-service.js` and `routes/admin/styles.js`'s save
  route also became locale-aware, since they write through the same
  `dpp_values` table - found and fixed before it could become a bug
  where clearing a French override would have silently deleted the
  English default instead.
- Public routes: `?lang=` on `/dpp/:batch/:gtin/:sgtin` (HTML) and its
  `/json` export. Fixed a link-construction bug caught while wiring
  this up - the JSON link on the passport page was built as
  `${url}/json`, which breaks once `url` carries a `?lang=` query
  string (the `/json` segment would land after the query, not before
  it). Now built from a query-free `basePath` instead.
- Admin UI: a language tab bar (Default + existing locales + a
  free-text "add a locale" box, GET-navigated via `?lang=`) added to
  all four detail pages (Style, Batch, GTIN, SGTIN) - Style's save
  route lived in a different file (`routes/admin/styles.js`, from the
  Phase 0 era) and was initially missed, then fixed.
- Scope, per explicit decision: infrastructure only, no real
  translations entered as content.

## 2026-09-16 (latest) — Phase 1: production lock + passport versioning

- **Plan correction, caught before building the wrong thing**: the
  originally-written ROADMAP.md Phase 1 called for a
  `dpp_values.superseded_by` chain (multiple historical rows per
  field+entity). Checking the schema first showed `dpp_values` already
  has `UNIQUE(field_definition_id, entity_type, entity_id)`, which
  makes that impossible without rebuilding the table. Revised to reuse
  `field_change_log` (already exists, already records old/new values)
  for history instead.
- `db/init-v2.js`: added `batches.produced_at`, `dpp_values.locked_at`,
  and a new `passport_versions` table, all via explicit `ALTER TABLE` /
  `CREATE TABLE IF NOT EXISTS` + verified idempotent (ran init twice,
  no errors) — `CREATE TABLE IF NOT EXISTS` alone is a no-op against an
  existing table, which is exactly what caused the `data/dpp-v2.db`
  schema-mismatch bug fixed earlier this session.
- `services/field-service.js`'s `setValue()` now logs every real change
  to `field_change_log` (previously only `override-service.js` did —
  Phase 0's save routes logged nothing) and stamps `locked_at` when the
  entity (batch, or an SGTIN under a produced batch) is locked. Also
  removed a broken, unused `uuidv4` line
  (`require('crypto').randomBytes(16).toString('hex')` destructured for
  `v4` — never threw, never did anything either) found while editing
  this file.
- `repositories/passport-versions.js`: new, tracks SGTIN passport
  version bumps. Scoped to direct SGTIN writes only, per explicit
  decision — a Style/Batch/GTIN change does not cascade a version bump
  to SGTINs that inherit it.
- New route `POST /admin-v2/batch/:batchId/mark-produced`; lock banner
  + button on `batch-detail.ejs`; matching read-only banner + new
  "Passport Version History" panel on `sgtin-detail.ejs`.
- Verified end-to-end: marked batch `PO45001234` produced, edited a
  locked SGTIN's `repair_program` (old value landed in
  `field_change_log`, new row got `locked_at`), edited a GTIN-level
  field on the same chain and confirmed the SGTIN's passport version
  stayed at v1 (no cascade, as decided), and confirmed the public JSON
  export still resolves correctly afterward.

## 2026-09-16 (even later) — richer field-inheritance UI

Upgraded the Phase 0 view from a flat "Set at X" badge to the full
three-state design from the canvas mockup (Overridden here / Inherited
/ Not set yet), with the inherited value shown for comparison and a
working "Clear override" action.

- `routes/admin/hub-v2.js`: GTIN and SGTIN routes now compute a real
  `inheritedValue`/`inheritedFrom` per field — GTIN from its Style
  (well-defined, one `style_id`), SGTIN from the full GTIN > Batch >
  Style chain (well-defined, an SGTIN pins both). Reused
  `fieldRepository.getEntityValues()` for this, not a new query.
- **Batch intentionally kept to two states**, not three. Checked
  concretely: batch `PO45001234` contains GTINs from 4 different
  styles (112327, 131274, 910006, 500001), so "inherited from Style"
  has no single correct value to show for a batch-level field. Showing
  one anyway would have been misleading. Documented in-page.
- "Clear override" wired to the existing
  `DELETE /api/admin/overrides/:entityType/:entityId/field/:fieldKey`
  route (`routes/admin/overrides.js` / `services/override-service.js`)
  rather than writing a new endpoint — this one already existed,
  already validates entity type, and already writes an audit log entry
  via `audit-service.js`.
- Verified end-to-end again after the change: cleared and re-set
  overrides at GTIN and Batch level via the API, confirmed the view
  correctly flips between the three (or two) states, and confirmed the
  public `/dpp/.../json` export still resolves the same values with
  the same `source` as before.

## 2026-09-16 (later)

### Added — ROADMAP.md Phase 0, field administration gap
- `repositories/fields.js`: new `getFieldsForLevel(entityType, entityId)`
  — `LEFT JOIN` from `field_definitions` to `dpp_values`, filtered by
  the relevant `editable_at_*` flag, so a field with no value anywhere
  still renders as an empty, fillable input. Deliberately a new method,
  not a change to `getEntityValues()` — that one is load-bearing for
  `passport-resolver.js`'s inheritance logic and changing its shape
  would have broken it.
- "+ Add Field" form (`views/admin/hub-v2.ejs`) now has a level
  selector (Style/Batch/GTIN/SGTIN checkboxes), wired through
  `routes/admin/fields.js` to the existing (already-present but
  unused) `editable_at_*` columns.
- `views/admin/style-detail.ejs`: fixed a duplicate/dead "DPP Values
  Card" that would have shown blank entries once empty fields started
  being returned — filtered to only fields with a value, distinct from
  the real edit-mode list which correctly shows all fields.
- Added a matching "DPP Field Values" card (view + edit toggle, same
  visual pattern as the existing Style one) to `batch-detail.ejs`,
  `gtin-detail.ejs`, and `sgtin-detail.ejs`, plus a
  `POST /admin-v2/<level>/:id/dpp-values` route for each in
  `routes/admin/hub-v2.js`. These previously had no field-editing UI
  at all.
- **Verified end-to-end**: set `fiber_composition` at Style, overrode
  `country_of_origin` at Batch (Tunisia → France), set
  `care_instructions` at GTIN and `repair_program` at SGTIN, then
  confirmed all four resolve correctly with the right `source` in the
  public `/dpp/:batch/:gtin/:sgtin/json` output.
- **Security decision, recorded not silently applied:** the three new
  save routes intentionally have no authentication, matching the
  existing (unauthenticated) style route and the rest of v2's admin
  API — see ROADMAP.md's security note. Not fixed here; flagged as its
  own separate task.

## 2026-09-16

### Fixed
- **Login always returned 401 from the admin UI.**
  `routes/api.js`'s `verifyToken` middleware only read the JWT from the
  `Authorization` header, but every v2 admin page stores the token in a
  cookie and never sends that header. Now accepts
  `req.cookies?.token` as a fallback. *(committed: `b91a42e`)*
- **`data/dpp-v2.db` had a stale, incompatible schema.** The committed
  database file predated the `style_id`/`variant_id`/`batch_id` columns
  that `db/init-v2.js` now expects on `gtins`/`sgtins`, causing index
  creation to fail on every boot and `/admin-v2` to 500. Renamed the
  old file to `data/dpp-v2.db.stale-backup` (kept, not deleted) and let
  the app recreate it fresh.

### Added
- **Scan Analytics tab** in the admin hub (`/admin-v2?tab=analytics`):
  total scans, unique products scanned, a 14-day bar chart, most-scanned
  products, and a recent-scans log — built entirely on the existing
  `scan_events` table, no schema change. *(committed: `b91a42e`)*
- **Demo data for all four product types** (Jeans, T-Shirt, Kids Jeans,
  Accessories) with proper `variants` records (previously the variant
  codes B01/B02/B26/BLK/BRN were stuffed into `size_value_2` instead of
  real `variants` rows — fixed so the Variants column on the Styles tab
  counts correctly). *(committed: `b91a42e`)*
- **JSON export endpoint**: `GET /dpp/:batch/:gtin/:sgtin/json` —
  machine-readable passport export intended for the future EU DPP
  registry submission. Filters on `consumer_visible` (the first place
  in the codebase this flag is actually enforced — see COMPLIANCE.md
  gap 7). Does not log a scan event. Linked from the consumer passport
  page next to the existing GS1 URL. *(uncommitted — see "Pending
  commits" below)*

### Removed
- Two incorrect leftover styles (`114519` Classic Jeans, `114526`
  Skinny Jeans) left over from an earlier broken seed run. Their scan
  history (5 scan events) was moved to the Jeans `112327` test SGTIN
  first, not discarded. *(committed: `b91a42e`)*

### Investigated, not yet fixed
- Full architecture and EU/ESPR compliance review — see COMPLIANCE.md.
- Field-administration gap (can't actually edit a field's value at
  Batch/GTIN/SGTIN level, and a brand-new field is invisible until a
  value exists somewhere) — design proposed, not yet built. See
  ROADMAP.md Phase 0.
- `repositories/sgtins.js`'s `create()` omits `batch_id` from its
  `INSERT` — latent bug, not currently triggered by any live route.

### Design
- Brand-aligned visual redesign proposal for the admin hub and
  consumer passport (light + dark mode), plus the Phase 0
  field-administration fix, published as a design canvas — see
  DESIGN_SYSTEM.md.

### Branch hygiene
- Discovered `dpp-v2-local` / `dpp-v3-local` (created earlier from
  `master`) held only the older August GTIN work, not the actual
  September architecture the admin-v2 UI belongs to. Re-pointed
  `dpp-v2-local` at the real September work (`origin/dpp-v3`,
  `ecdd027`) and `dpp-v3-local` at a copy of it. The original
  August-only branches were kept, not deleted, renamed to
  `archive-gtin-aug2026` and `archive-gtin-aug2026-v3attempt`.

## Pending commits (uncommitted as of this writing)

- `routes/dpp.js`, `views/dpp-passport.ejs` — the JSON export endpoint
  above.
- `COMPLIANCE.md`, `ROADMAP.md`, `DESIGN_SYSTEM.md`, this file — new
  documentation.
