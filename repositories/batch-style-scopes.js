const db = require('../db/init-v2');

// A DPP field override scoped to a (Batch, Style) or (Batch, Style,
// Variant) combination - see db/init-v2.js's batch_style_scopes
// comment for why this exists (a Batch can span multiple Styles).
// dpp_values points at a row here via entity_type='batch_style'.
class BatchStyleScopeRepository {
  // Read-only - used when resolving a passport, must never create a
  // row just because someone viewed a page.
  async find(batchId, styleId, variantId = null) {
    return db.get(
      `SELECT * FROM batch_style_scopes WHERE batch_id = ? AND style_id = ? AND variant_id IS ?`,
      [batchId, styleId, variantId]
    );
  }

  async getById(id) {
    return db.get(`SELECT * FROM batch_style_scopes WHERE id = ?`, [id]);
  }

  // Used only when actually saving a value for a scope - SQLite
  // doesn't enforce uniqueness across NULL variant_id rows, so this
  // does the SELECT-then-INSERT itself rather than relying on the
  // table's UNIQUE constraint (see db/init-v2.js).
  async getOrCreate(batchId, styleId, variantId = null) {
    const existing = await this.find(batchId, styleId, variantId);
    if (existing) return existing;

    const result = await db.run(
      `INSERT INTO batch_style_scopes (batch_id, style_id, variant_id) VALUES (?, ?, ?)`,
      [batchId, styleId, variantId]
    );
    return this.getById(result.lastID);
  }

  // Distinct Style/Variant combinations actually present in a batch,
  // derived from its planned GTINs - drives the scope picker on the
  // Batch detail page.
  async listCombosForBatch(batchId) {
    return db.all(`
      SELECT DISTINCT
        g.style_id,
        s.style_number,
        g.variant_id,
        v.variant_name,
        COALESCE(v.product_name, s.product_name) AS effective_name
      FROM batch_gtins bg
      JOIN gtins g ON g.id = bg.gtin_id
      JOIN styles s ON s.id = g.style_id
      LEFT JOIN variants v ON v.id = g.variant_id
      WHERE bg.batch_id = ?
      ORDER BY s.style_number ASC, COALESCE(v.variant_name, '') ASC
    `, [batchId]);
  }
}

module.exports = new BatchStyleScopeRepository();
