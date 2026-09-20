const db = require('../db/init-v2');

const VALID_SCHEMES = ['batch_gtin_sgtin', 'batch_gtin', 'gtin_sgtin'];

class ProductTypeRepository {
  async list() {
    return db.all(`SELECT * FROM product_types ORDER BY label ASC`);
  }

  async getById(id) {
    return db.get(`SELECT * FROM product_types WHERE id = ?`, [id]);
  }

  // Resolves a Style's GS1 scheme through its product_type_id - null
  // (no product type set) and a style whose product_type_id points at
  // nothing both default to 'batch_gtin_sgtin' (full hierarchy), the
  // only scheme that existed before this column did, so an
  // unconfigured style's passport behavior never silently changes.
  async getSchemeForStyle(styleId) {
    const row = await db.get(
      `SELECT pt.gs1_scheme FROM styles s
       LEFT JOIN product_types pt ON pt.id = s.product_type_id
       WHERE s.id = ?`,
      [styleId]
    );
    return (row && row.gs1_scheme) || 'batch_gtin_sgtin';
  }

  async create(key, label, gs1Scheme = 'batch_gtin_sgtin') {
    if (!VALID_SCHEMES.includes(gs1Scheme)) {
      throw new Error(`Invalid gs1_scheme. Must be one of: ${VALID_SCHEMES.join(', ')}`);
    }
    const result = await db.run(
      `INSERT INTO product_types (key, label, gs1_scheme) VALUES (?, ?, ?)`,
      [key, label, gs1Scheme]
    );
    return result.lastID;
  }

  async updateScheme(id, gs1Scheme) {
    if (!VALID_SCHEMES.includes(gs1Scheme)) {
      throw new Error(`Invalid gs1_scheme. Must be one of: ${VALID_SCHEMES.join(', ')}`);
    }
    await db.run(
      `UPDATE product_types SET gs1_scheme = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [gs1Scheme, id]
    );
  }
}

module.exports = new ProductTypeRepository();
module.exports.VALID_SCHEMES = VALID_SCHEMES;
