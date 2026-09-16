# Changelog

Session-level log of changes to `dpp-v2-local`, kept in addition to git
history because several changes here are fixes to bugs discovered
during manual review, not obvious from a commit message alone.

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
