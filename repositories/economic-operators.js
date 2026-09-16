const db = require('../db/init-v2');

// ROADMAP.md Phase 4 - the legally-responsible party (manufacturer,
// importer, or authorized representative) ESPR requires the passport
// to name. Assigned at Style level, optionally overridden at Batch.
class EconomicOperatorRepository {
  async list() {
    return db.all(`SELECT * FROM economic_operators ORDER BY legal_name ASC`);
  }

  async getById(id) {
    if (!id) return null;
    return db.get(`SELECT * FROM economic_operators WHERE id = ?`, [id]);
  }

  async create(data) {
    const result = await db.run(
      `INSERT INTO economic_operators (role, legal_name, address, country, registration_number)
       VALUES (?, ?, ?, ?, ?)`,
      [data.role, data.legal_name, data.address || null, data.country || null, data.registration_number || null]
    );
    return result.lastID;
  }

  async update(id, data) {
    await db.run(
      `UPDATE economic_operators
       SET role = ?, legal_name = ?, address = ?, country = ?, registration_number = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [data.role, data.legal_name, data.address || null, data.country || null, data.registration_number || null, id]
    );
  }

  async delete(id) {
    await db.run(`DELETE FROM economic_operators WHERE id = ?`, [id]);
  }

  async setForStyle(styleId, operatorId) {
    await db.run(`UPDATE styles SET operator_id = ? WHERE id = ?`, [operatorId || null, styleId]);
  }

  async setForBatch(batchId, operatorId) {
    await db.run(`UPDATE batches SET operator_id = ? WHERE id = ?`, [operatorId || null, batchId]);
  }

  // Batch overrides Style, same precedence pattern as everywhere else.
  async resolveForBatchAndStyle(batchOperatorId, styleOperatorId) {
    const id = batchOperatorId || styleOperatorId;
    if (!id) return null;
    const operator = await this.getById(id);
    if (!operator) return null;
    return {
      ...operator,
      source: batchOperatorId ? 'batch' : 'style'
    };
  }
}

module.exports = new EconomicOperatorRepository();
