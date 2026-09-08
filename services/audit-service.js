const db = require('../db/init-v2');
const fieldRepository = require('../repositories/fields');
const { randomBytes } = require('crypto');

class AuditService {
  /**
   * Generate a unique change ID for grouping related changes
   */
  generateChangeId() {
    return randomBytes(8).toString('hex');
  }

  /**
   * Record a field value change in the audit log
   */
  async logFieldChange(fieldKey, entityType, entityId, action, oldValue, newValue, options = {}) {
    // Get field definition
    const fieldDef = await fieldRepository.getFieldDefinitionByKey(fieldKey);
    if (!fieldDef) {
      throw new Error(`Field '${fieldKey}' not found`);
    }

    const changeId = options.changeId || this.generateChangeId();
    const userId = options.userId || null;
    const reason = options.reason || null;
    const sourceSystem = options.sourceSystem || 'manual';

    const sql = `
      INSERT INTO field_change_log
      (change_id, field_definition_id, entity_type, entity_id, action, old_value, new_value, user_id, reason, source_system)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.run(sql, [
      changeId,
      fieldDef.id,
      entityType,
      entityId,
      action,
      oldValue,
      newValue,
      userId,
      reason,
      sourceSystem
    ]);

    return changeId;
  }

  /**
   * Get audit history for an entity
   */
  async getEntityHistory(entityType, entityId) {
    const sql = `
      SELECT
        fcl.*,
        fd.field_key,
        fd.label
      FROM field_change_log fcl
      JOIN field_definitions fd ON fcl.field_definition_id = fd.id
      WHERE fcl.entity_type = ? AND fcl.entity_id = ?
      ORDER BY fcl.created_at DESC
    `;

    return db.all(sql, [entityType, entityId]);
  }

  /**
   * Get audit history for a specific field
   */
  async getFieldHistory(fieldKey, entityType, entityId) {
    const fieldDef = await fieldRepository.getFieldDefinitionByKey(fieldKey);
    if (!fieldDef) {
      throw new Error(`Field '${fieldKey}' not found`);
    }

    const sql = `
      SELECT *
      FROM field_change_log
      WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC
    `;

    return db.all(sql, [fieldDef.id, entityType, entityId]);
  }

  /**
   * Get all changes in a change group
   */
  async getChangeGroup(changeId) {
    const sql = `
      SELECT
        fcl.*,
        fd.field_key,
        fd.label
      FROM field_change_log fcl
      JOIN field_definitions fd ON fcl.field_definition_id = fd.id
      WHERE fcl.change_id = ?
      ORDER BY fcl.created_at ASC
    `;

    return db.all(sql, [changeId]);
  }

  /**
   * Get audit trail summary for an entity
   */
  async getSummary(entityType, entityId) {
    const sql = `
      SELECT
        action,
        COUNT(*) as count,
        MAX(created_at) as last_change
      FROM field_change_log
      WHERE entity_type = ? AND entity_id = ?
      GROUP BY action
    `;

    const results = await db.all(sql, [entityType, entityId]);

    const summary = {
      entityType,
      entityId,
      totalChanges: 0,
      byAction: {}
    };

    for (const row of results) {
      summary.byAction[row.action] = row.count;
      summary.totalChanges += row.count;
    }

    return summary;
  }
}

module.exports = new AuditService();
