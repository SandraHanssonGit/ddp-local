const db = require('../db/init-v2');

// ROADMAP.md Phase 1 - tracks "which version of the passport was shown
// on date X", scoped (deliberately, for now) to direct writes on the
// SGTIN itself. A change to a Style/Batch/GTIN field that an SGTIN
// inherits does NOT bump the SGTIN's version - see ROADMAP.md for why
// that cascading scope was left out of this pass.
class PassportVersionRepository {
  async bumpVersion(entityType, entityId, changeType, changeNote = null) {
    const latest = await db.get(
      `SELECT * FROM passport_versions WHERE entity_type = ? AND entity_id = ? ORDER BY version_number DESC LIMIT 1`,
      [entityType, entityId]
    );

    const nextVersion = latest ? latest.version_number + 1 : 1;

    const result = await db.run(
      `INSERT INTO passport_versions (entity_type, entity_id, version_number, change_type, change_note)
       VALUES (?, ?, ?, ?, ?)`,
      [entityType, entityId, nextVersion, changeType, changeNote]
    );

    if (latest) {
      await db.run(`UPDATE passport_versions SET superseded_by = ? WHERE id = ?`, [result.lastID, latest.id]);
    }

    return result.lastID;
  }

  async getHistory(entityType, entityId) {
    return db.all(
      `SELECT * FROM passport_versions WHERE entity_type = ? AND entity_id = ? ORDER BY version_number DESC`,
      [entityType, entityId]
    );
  }

  async getCurrentVersion(entityType, entityId) {
    return db.get(
      `SELECT * FROM passport_versions WHERE entity_type = ? AND entity_id = ? ORDER BY version_number DESC LIMIT 1`,
      [entityType, entityId]
    );
  }
}

module.exports = new PassportVersionRepository();
