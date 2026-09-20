const db = require('../db/init-v2');

class SgtinRepository {
  async create(gtinId, batchId, serialNumber, options = {}) {
    const sql = `
      INSERT INTO sgtins (gtin_id, batch_id, serial_number, sgtin, rfid_id, qc_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const result = await db.run(sql, [
      gtinId,
      batchId,
      serialNumber,
      options.sgtin || null,
      options.rfid_id || null,
      options.qc_status || null
    ]);
    return result.lastID;
  }

  // Serials are unique per GTIN across every batch it's ever been
  // produced in (schema: UNIQUE(gtin_id, serial_number), not scoped to
  // a batch) - a real production run must never restart at 1 and risk
  // colliding with an earlier batch's units for the same GTIN.
  async getMaxSerialForGtin(gtinId) {
    const row = await db.get(
      `SELECT MAX(CAST(serial_number AS INTEGER)) as maxSerial FROM sgtins WHERE gtin_id = ?`,
      [gtinId]
    );
    return row && row.maxSerial ? row.maxSerial : 0;
  }

  async getById(id) {
    const sql = `SELECT * FROM sgtins WHERE id = ?`;
    return db.get(sql, [id]);
  }

  async getBySerialNumber(serialNumber) {
    const sql = `SELECT * FROM sgtins WHERE serial_number = ?`;
    return db.get(sql, [serialNumber]);
  }

  async getByGtinAndSerial(gtin, serialNumber) {
    const sql = `
      SELECT s.* FROM sgtins s
      JOIN gtins g ON s.gtin_id = g.id
      WHERE g.gtin = ? AND s.serial_number = ?
    `;
    return db.get(sql, [gtin, serialNumber]);
  }

  async getBySgtin(sgtin) {
    const sql = `SELECT * FROM sgtins WHERE sgtin = ?`;
    return db.get(sql, [sgtin]);
  }

  async listByGtin(gtinId) {
    const sql = `SELECT * FROM sgtins WHERE gtin_id = ? ORDER BY serial_number ASC`;
    return db.all(sql, [gtinId]);
  }

  async update(id, updates) {
    const allowedFields = ['sgtin', 'rfid_id', 'qc_status'];
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
    const sql = `UPDATE sgtins SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await db.run(sql, values);
  }

  async delete(id) {
    const sql = `DELETE FROM sgtins WHERE id = ?`;
    await db.run(sql, [id]);
  }
}

module.exports = new SgtinRepository();
