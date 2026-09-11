const db = require('../db/init-v2');

class GtinRepository {
  async create(styleId, gtin, options = {}) {
    const sql = `
      INSERT INTO gtins (
        style_id, variant_id, gtin, ean, size, color, variant, weight,
        product_type, item_number, size_value_1, size_value_2, size_value_3
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await db.run(sql, [
      styleId,
      options.variant_id || null,
      gtin,
      options.ean || null,
      options.size || null,
      options.color || null,
      options.variant || null,
      options.weight || null,
      options.product_type || null,
      options.item_number || null,
      options.size_value_1 || null,
      options.size_value_2 || null,
      options.size_value_3 || null
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
    const sql = `
      SELECT DISTINCT g.*, s.style_number
      FROM gtins g
      JOIN sgtins sg ON sg.gtin_id = g.id
      JOIN styles s ON g.style_id = s.id
      WHERE sg.batch_id = ?
      ORDER BY s.style_number ASC, g.item_number ASC
    `;
    return db.all(sql, [batchId]);
  }

  async listByBatchAndStyle(batchId, styleId) {
    const sql = `
      SELECT DISTINCT g.* FROM gtins g
      JOIN sgtins sg ON sg.gtin_id = g.id
      WHERE sg.batch_id = ? AND g.style_id = ?
      ORDER BY g.item_number ASC
    `;
    return db.all(sql, [batchId, styleId]);
  }

  async listByStyle(styleId) {
    const sql = `
      SELECT g.*, v.variant_name
      FROM gtins g
      LEFT JOIN variants v ON v.id = g.variant_id
      WHERE g.style_id = ?
      ORDER BY COALESCE(v.variant_name, ''), g.item_number ASC
    `;
    return db.all(sql, [styleId]);
  }

  async update(id, updates) {
    const allowedFields = [
      'ean', 'size', 'color', 'variant', 'weight',
      'product_type', 'item_number', 'size_value_1', 'size_value_2', 'size_value_3'
    ];
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
