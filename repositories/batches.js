const db = require('../db/init-v2');

class BatchRepository {
  async create(styleId, batchId, options = {}) {
    const sql = `
      INSERT INTO batches
      (style_id, batch_id, production_order, production_date, supplier, factory, country_of_production)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await db.run(sql, [
      styleId,
      batchId,
      options.production_order || null,
      options.production_date || null,
      options.supplier || null,
      options.factory || null,
      options.country_of_production || null
    ]);
    return result.lastID;
  }

  async getById(id) {
    const sql = `SELECT * FROM batches WHERE id = ?`;
    return db.get(sql, [id]);
  }

  async getByStyleAndBatchId(styleId, batchId) {
    const sql = `SELECT * FROM batches WHERE style_id = ? AND batch_id = ?`;
    return db.get(sql, [styleId, batchId]);
  }

  async listByStyle(styleId) {
    const sql = `SELECT * FROM batches WHERE style_id = ? ORDER BY batch_id ASC`;
    return db.all(sql, [styleId]);
  }

  async update(id, updates) {
    const allowedFields = ['production_order', 'production_date', 'supplier', 'factory', 'country_of_production'];
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
    const sql = `UPDATE batches SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await db.run(sql, values);
  }

  async delete(id) {
    const sql = `DELETE FROM batches WHERE id = ?`;
    await db.run(sql, [id]);
  }
}

module.exports = new BatchRepository();
