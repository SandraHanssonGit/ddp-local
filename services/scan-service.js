const db = require('../db/init-v2');

class ScanService {
  /**
   * Log a scan event for an SGTIN
   * Automatically captured when passport is viewed
   */
  async logScan(sgtinId, options = {}) {
    const sql = `
      INSERT INTO scan_events (sgtin_id, scan_location, scan_method, ip_address, user_agent, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    return db.run(sql, [
      sgtinId,
      options.location || null,
      options.method || 'qr',
      options.ip_address || null,
      options.user_agent || null,
      options.notes || null
    ]);
  }

  /**
   * Get scan count for an SGTIN
   */
  async getScanCount(sgtinId) {
    const sql = `SELECT COUNT(*) as count FROM scan_events WHERE sgtin_id = ?`;
    const result = await db.get(sql, [sgtinId]);
    return result?.count || 0;
  }

  /**
   * Get all scans for an SGTIN
   */
  async getScans(sgtinId, limit = 50) {
    const sql = `
      SELECT * FROM scan_events
      WHERE sgtin_id = ?
      ORDER BY scan_timestamp DESC
      LIMIT ?
    `;
    return db.all(sql, [sgtinId, limit]);
  }

  /**
   * Get scan statistics for an SGTIN
   */
  async getScanStats(sgtinId) {
    const sql = `
      SELECT
        COUNT(*) as total_scans,
        MIN(scan_timestamp) as first_scan,
        MAX(scan_timestamp) as last_scan,
        COUNT(DISTINCT scan_location) as unique_locations
      FROM scan_events
      WHERE sgtin_id = ?
    `;
    return db.get(sql, [sgtinId]);
  }

  /**
   * Get scans within date range
   */
  async getScansBetween(sgtinId, startDate, endDate) {
    const sql = `
      SELECT * FROM scan_events
      WHERE sgtin_id = ? AND scan_timestamp BETWEEN ? AND ?
      ORDER BY scan_timestamp DESC
    `;
    return db.all(sql, [sgtinId, startDate, endDate]);
  }
}

module.exports = new ScanService();
