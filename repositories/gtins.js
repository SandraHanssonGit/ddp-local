const db = require('../db/init-v2');

class GtinRepository {
  async create(batchId, gtin, options = {}) {
    const sql = `
      INSERT INTO gtins (batch_id, gtin, ean, size, color, variant, weight)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await db.run(sql, [
      batchId,
      gtin,
      options.ean || null,
      options.size || null,
      options.color || null,
      options.variant || null,
      options.weight || null
    ]);
    return result.lastID;
  }

  async getById(id) {
    const sql = `SELECT * FROM gtins WHERE id = ?`;
    return db.get(sql, [id]);
  }

  async getByGtin(gtin) {
    const sql = `SELECT * FROM gtins WHERE gtin = ?`;
    return db.get(sql, [gtin]);
  }

  async listByBatch(batchId) {
    const sql = `SELECT * FROM gtins WHERE batch_id = ? ORDER BY gtin ASC`;
    return db.all(sql, [batchId]);
  }

  async update(id, updates) {
    const allowedFields = ['ean', 'size', 'color', 'variant', 'weight'];
    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) return;

    values.push(id);
    const sql = `UPDATE gtins SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await db.run(sql, values);
  }

  async delete(id) {
    const sql = `DELETE FROM gtins WHERE id = ?`;
    await db.run(sql, [id]);
  }
}

module.exports = new GtinRepository();
