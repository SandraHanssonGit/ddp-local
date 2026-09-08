const db = require('../db/init-v2');

class StyleRepository {
  async create(styleNumber, productName, productType) {
    const sql = `
      INSERT INTO styles (style_number, product_name, product_type)
      VALUES (?, ?, ?)
    `;
    const result = await db.run(sql, [styleNumber, productName, productType]);
    return result.lastID;
  }

  async getById(id) {
    const sql = `SELECT * FROM styles WHERE id = ?`;
    return db.get(sql, [id]);
  }

  async getByStyleNumber(styleNumber) {
    const sql = `SELECT * FROM styles WHERE style_number = ?`;
    return db.get(sql, [styleNumber]);
  }

  async list() {
    const sql = `SELECT * FROM styles ORDER BY style_number ASC`;
    return db.all(sql);
  }

  async update(id, updates) {
    const allowedFields = ['product_name', 'product_type'];
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
    const sql = `UPDATE styles SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await db.run(sql, values);
  }

  async delete(id) {
    const sql = `DELETE FROM styles WHERE id = ?`;
    await db.run(sql, [id]);
  }
}

module.exports = new StyleRepository();
