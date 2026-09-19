const db = require('../db/init-v2');

// batch_gtins already exists (planned quantity per GTIN in a Batch -
// see db/init-v2.js). Freeze-at-production design (2026-09-19) reuses
// its id as the entity_id for entity_type='batch_gtin' in dpp_values -
// no new table needed, same pattern as batch_style_scopes.
class BatchGtinRepository {
  // Read-only - used when resolving a passport, must never create a
  // row just because someone viewed a page.
  async find(batchId, gtinId) {
    return db.get(
      `SELECT * FROM batch_gtins WHERE batch_id = ? AND gtin_id = ?`,
      [batchId, gtinId]
    );
  }

  async getById(id) {
    return db.get(`SELECT * FROM batch_gtins WHERE id = ?`, [id]);
  }

  async listForBatch(batchId) {
    return db.all(`SELECT * FROM batch_gtins WHERE batch_id = ?`, [batchId]);
  }
}

module.exports = new BatchGtinRepository();
