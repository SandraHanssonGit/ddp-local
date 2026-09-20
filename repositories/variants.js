const db = require('../db/init-v2');

class VariantRepository {
  async create(styleId, variantName, productName, imageUrl) {
    const sql = `
      INSERT INTO variants (style_id, variant_name, product_name, image_url)
      VALUES (?, ?, ?, ?)
    `;
    const result = await db.run(sql, [styleId, variantName, productName || null, imageUrl || null]);
    return result.lastID;
  }

  async getById(id) {
    const sql = `SELECT * FROM variants WHERE id = ?`;
    return db.get(sql, [id]);
  }

  async listByStyle(styleId) {
    const sql = `SELECT * FROM variants WHERE style_id = ? ORDER BY variant_name ASC`;
    return db.all(sql, [styleId]);
  }

  // Effective product_name/image_url - falls back to the parent style's
  // when the variant hasn't set its own (see ROADMAP.md variant
  // architecture fix: most products share the style's name/image, but
  // some - like tops - need a distinct one per variant).
  async getWithEffectiveContent(id) {
    const sql = `
      SELECT
        v.*,
        COALESCE(v.product_name, s.product_name) AS effective_product_name,
        COALESCE(v.image_url, s.image_url) AS effective_image_url
      FROM variants v
      JOIN styles s ON s.id = v.style_id
      WHERE v.id = ?
    `;
    return db.get(sql, [id]);
  }

  async update(id, updates) {
    const allowedFields = ['variant_name', 'product_name', 'image_url'];
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
    const sql = `UPDATE variants SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await db.run(sql, values);
  }
}

module.exports = new VariantRepository();
