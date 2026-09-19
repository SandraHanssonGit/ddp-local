const db = require('../db/init-v2');

const VALID_SCHEMES = ['batch_gtin_sgtin', 'batch_gtin', 'gtin_sgtin'];

class ProductTypeRepository {
  async list() {
    return db.all(`SELECT * FROM product_types ORDER BY label ASC`);
  }

  async getById(id) {
    return db.get(`SELECT * FROM product_types WHERE id = ?`, [id]);
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
