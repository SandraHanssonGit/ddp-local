const db = require('../db/init-v2');

class FieldRepository {
  // Field Definitions
  async createFieldDefinition(fieldKey, label, category, options = {}) {
    const sql = `
      INSERT INTO field_definitions
      (field_key, label, description, data_type, category, required, consumer_visible, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await db.run(sql, [
      fieldKey,
      label,
      options.description || '',
      options.data_type || 'text',
      category,
      options.required ? 1 : 0,
      options.consumer_visible !== false ? 1 : 0,
      options.sort_order || 0
    ]);
    return result.lastID;
  }

  async getFieldDefinition(fieldId) {
    const sql = `SELECT * FROM field_definitions WHERE id = ?`;
    return db.get(sql, [fieldId]);
  }

  async getFieldDefinitionByKey(fieldKey) {
    const sql = `SELECT * FROM field_definitions WHERE field_key = ?`;
    return db.get(sql, [fieldKey]);
  }

  async listFieldDefinitions(category = null) {
    let sql = `SELECT * FROM field_definitions`;
    const params = [];

    if (category) {
      sql += ` WHERE category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY sort_order ASC, label ASC`;
    return db.all(sql, params);
  }

  async updateFieldDefinition(fieldId, updates) {
    const allowedFields = ['label', 'description', 'required', 'consumer_visible', 'sort_order', 'category'];
    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) return;

    values.push(fieldId);
    const sql = `UPDATE field_definitions SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await db.run(sql, values);
  }

  async deleteFieldDefinition(fieldId) {
    // Soft delete by checking if values exist
    const existingValues = await db.all(`SELECT id FROM dpp_values WHERE field_definition_id = ?`, [fieldId]);
    if (existingValues.length > 0) {
      throw new Error('Cannot delete field that has values assigned. Remove values first.');
    }

    const sql = `DELETE FROM field_definitions WHERE id = ?`;
    await db.run(sql, [fieldId]);
  }

  // DPP Values
  async setDppValue(fieldDefinitionId, entityType, entityId, value, sourceSystem = 'manual', userId = null) {
    const sql = `
      INSERT INTO dpp_values
      (field_definition_id, entity_type, entity_id, value, source_system, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(field_definition_id, entity_type, entity_id)
      DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `;
    const result = await db.run(sql, [
      fieldDefinitionId,
      entityType,
      entityId,
      value,
      sourceSystem,
      userId,
      value
    ]);
    return result.lastID;
  }

  async getDppValue(fieldDefinitionId, entityType, entityId) {
    const sql = `
      SELECT * FROM dpp_values
      WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ?
    `;
    return db.get(sql, [fieldDefinitionId, entityType, entityId]);
  }

  async getEntityValues(entityType, entityId) {
    const sql = `
      SELECT
        dv.*,
        fd.field_key,
        fd.label,
        fd.category,
        fd.data_type
      FROM dpp_values dv
      JOIN field_definitions fd ON dv.field_definition_id = fd.id
      WHERE dv.entity_type = ? AND dv.entity_id = ?
      ORDER BY fd.sort_order ASC, fd.label ASC
    `;
    return db.all(sql, [entityType, entityId]);
  }

  async removeDppValue(fieldDefinitionId, entityType, entityId) {
    const sql = `
      DELETE FROM dpp_values
      WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ?
    `;
    await db.run(sql, [fieldDefinitionId, entityType, entityId]);
  }

  async getEntityValuesByCategory(entityType, entityId, category) {
    const sql = `
      SELECT
        dv.*,
        fd.field_key,
        fd.label,
        fd.category,
        fd.data_type,
        fd.consumer_visible
      FROM dpp_values dv
      JOIN field_definitions fd ON dv.field_definition_id = fd.id
      WHERE dv.entity_type = ? AND dv.entity_id = ? AND fd.category = ?
      ORDER BY fd.sort_order ASC, fd.label ASC
    `;
    return db.all(sql, [entityType, entityId, category]);
  }
}

module.exports = new FieldRepository();
