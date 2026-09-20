// Builds the GS1 Digital Link path for an SGTIN, shaped by its
// product type's GS1 Scheme (Settings > Product Types) - 2026-09-20
// user request: the URL should actually vary by scheme instead of
// always using the same fixed shape regardless of what's configured.
//
// - 'batch_gtin_sgtin' (Full hierarchy): includes Batch (GS1 AI 10) -
//   /01/{gtin}/10/{batch}/21/{serial}
// - 'gtin_sgtin' (Individual units, no Batch): Batch intentionally
//   left out, matching the scheme's own name - /01/{gtin}/21/{serial}
// - 'batch_gtin' (Batch + GTIN, no individual units): has no SGTIN at
//   all, so this function doesn't apply - not handled here (see
//   ROADMAP.md's GS1 Scheme entry for that still-unbuilt piece).
function buildDigitalLinkPath({ gtin14, serial, batchId, scheme }) {
  if (scheme === 'batch_gtin_sgtin' && batchId) {
    return `/01/${gtin14}/10/${batchId}/21/${serial}`;
  }
  return `/01/${gtin14}/21/${serial}`;
}

module.exports = { buildDigitalLinkPath };
