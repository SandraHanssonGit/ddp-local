# DPP v2 — EU Regulatory Compliance Review

Status: review complete, no fundamental redesign needed — content and a
handful of additive tables are missing, not a new architecture.

Scope: EU Ecodesign for Sustainable Products Regulation (ESPR,
2024/1781) and the forthcoming textile-specific delegated act, as
understood at the time of this review. The delegated act's final
technical annex was not published when this review was written —
treat field lists and thresholds below as best-effort, not final.

## What the current architecture already gets right

- **Hierarchical masterdata** (`styles` → `variants` → `gtins`,
  `batches` → `sgtins`) matches how GS1/EU expect identification at
  both the product-model level and the individual-item level.
- **Dynamic field system** (`field_definitions` / `dpp_values`) means
  new regulatory fields are a data change, not a schema migration —
  important because delegated acts will keep adding requirements
  product-group by product-group.
- **`field_change_log`** gives field-level audit history — the right
  foundation for the "audit trail" requirement.
- **`batches.factory` / `batches.country_of_production`** gives a
  starting point for supply-chain traceability.
- **`consumer_visible`** on `field_definitions` shows the data model
  already anticipated that not everything should be public — see the
  gap below on why this isn't enough on its own, and why it isn't even
  enforced on the live page yet.

## Gaps

### 1. No GS1 Digital Link (ISO/IEC 18975)
The EU's technical annexes point to GS1 Digital Link
(`/01/{GTIN}/21/{serial}`) as the carrier format for a DPP URL. The
live public route is `/dpp/:batch/:gtin/:sgtin` — a custom, non-standard
scheme. GS1 Digital Link routing was implemented once (on the
August/GTIN branch, since archived as `archive-gtin-aug2026`) and
deliberately disabled — it should be ported into v2 before more QR
codes are printed against the current URL scheme.

### 2. Content is thin
Only six fields are defined today: `fiber_composition`,
`care_instructions`, `country_of_origin`, `sustainability`,
`repair_program`, `secondhand_program`. Missing entirely:
- Substances of Very High Concern / REACH candidate list declaration
  (and, longer-term, a link to the SCIP database)
- Microplastic shedding (textile-specific concern)
- Durability/warranty, repairability score, spare-parts availability
  (the "right to repair" cluster)
- Environmental footprint (PEF or equivalent) — carbon, water
- End-of-life / recycling instructions (beyond the existing
  `secondhand_program`)
- Per-component material origin (today `fiber_composition` is one free
  text field, not structured per component)

This is a data problem, not an architecture problem — see ROADMAP.md
Phase 5.

### 3. No "Economic Operator" identity
ESPR requires the passport to name who is legally responsible
(manufacturer, importer, or authorized representative — name and
address). No table or field carries this today. See ROADMAP.md
Phase 4.

### 4. No multi-language support
`dpp_values.value` is a single `TEXT` column — no language dimension.
Nudie sells across the whole EU, so this is not a future concern, it's
current: consumer-facing information needs to be available in the
languages of the member states of sale. See ROADMAP.md Phase 2
(re-prioritized above GS1 Digital Link and economic operators for this
reason).

### 5. No passport-level versioning
`field_change_log` tracks individual field edits, but nothing answers
"which version of the whole passport was shown on date X" — relevant
for recalls or corrections after a product has already shipped. The
old v1 schema had `pass_version` / `pass_issued_at` on
`batch_style_data`; v2 dropped this when the architecture changed. See
ROADMAP.md Phase 1.

### 6. No EU registry linkage
The Commission is building a central DPP registry that unique
identifiers will eventually need to register against. No
`registry_id` / sync-status field exists. **Deliberately deferred** —
the registry's technical interface isn't published yet; building
against it now would mean guessing.

### 7. No role-based data access beyond a single flag ✅ enforcement fixed (2026-09-19)
`consumer_visible` is the only visibility control. **Fixed**: it now
applies to the live HTML passport page too (both `/01/:gtin/21/:serial`
and the legacy `/dpp/:batch/:gtin/:sgtin` route, which share rendering
code) via a shared `filterToConsumerVisible()` helper in
`services/passport-page-service.js` - previously only the JSON export
filtered correctly.

Still open: there is no mechanism today for a market-surveillance
authority or a recycler to see an expanded view beyond the single
consumer_visible flag.

There is also no mechanism today for a market-surveillance authority
or a recycler to see an expanded view — and there deliberately
shouldn't be a self-service "pick your role" toggle on a public page,
since that would let anyone claim elevated access. That access needs
to be a separate authenticated path (login or signed token), not a
public switch.

## Recommendation

**Do not rebuild.** The combination of dynamic fields + hierarchical
identity + an audit log is the right foundation — it's what would need
to be built if it were missing. What's missing is:
1. A handful of additive tables (`economic_operators`,
   `passport_versions`)
2. A `locale` column
3. A route (GS1 Digital Link)
4. Content (more `field_definitions` rows)
5. ~~Enforcing `consumer_visible` on the live page~~ ✅ done
   (2026-09-19) - and making it possible to actually administer a
   field at Batch/GTIN/SGTIN level at all (see ROADMAP.md — "Field
   administration gap")

See ROADMAP.md for scope and ordering.

## Open questions (not answered by this review)

- Exact field list and thresholds for the textile delegated act
  weren't final at review time — the field list in Gap 2 is a
  reasonable placeholder set, not a definitive compliance checklist.
  **Accepted as-is**: not blocking, since `field_definitions` lets
  fields be added incrementally without a schema change.
- No target compliance deadline is recorded anywhere in this repo or
  conversation. **Accepted as-is** for now — Roadmap phases are
  ordered but not dated.
