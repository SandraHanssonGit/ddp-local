const db = require('../db/init-v2');

class BatchRepository {
  async create(batchId, options = {}) {
    const sql = `
      INSERT INTO batches
      (batch_id, production_order, production_date, supplier, factory, country_of_production)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const result = await db.run(sql, [
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

  async getByBatchId(batchId) {
    const sql = `SELECT * FROM batches WHERE batch_id = ?`;
    return db.get(sql, [batchId]);
  }

  async list() {
    const sql = `SELECT * FROM batches ORDER BY batch_id ASC`;
    return db.all(sql, []);
  }

  async getWithGtins(batchId) {
    const sql = `
      SELECT
        b.*,
        COUNT(DISTINCT sg.id) as sgtin_count,
        COUNT(DISTINCT g.style_id) as style_count
      FROM batches b
      LEFT JOIN sgtins sg ON b.id = sg.batch_id
      LEFT JOIN gtins g ON g.id = sg.gtin_id
      WHERE b.batch_id = ?
      GROUP BY b.id
    `;
    return db.get(sql, [batchId]);
  }

  async getGtinsByBatch(batchId) {
    const sql = `
      SELECT DISTINCT
        g.*,
        s.style_number,
        COUNT(sg.id) as sgtin_count
      FROM sgtins sg
      JOIN gtins g ON g.id = sg.gtin_id
      JOIN styles s ON g.style_id = s.id
      JOIN batches b ON b.id = sg.batch_id
      WHERE b.batch_id = ?
      GROUP BY g.id
      ORDER BY s.style_number ASC, g.item_number ASC
    `;
    return db.all(sql, [batchId]);
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
