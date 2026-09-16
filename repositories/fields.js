const db = require('../db/init-v2');

class FieldRepository {
  // Field Definitions
  async createFieldDefinition(fieldKey, label, category, options = {}) {
    const sql = `
      INSERT INTO field_definitions
      (field_key, label, description, data_type, category, required, consumer_visible,
       editable_at_style, editable_at_batch, editable_at_gtin, editable_at_sgtin, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await db.run(sql, [
      fieldKey,
      label,
      options.description || '',
      options.data_type || 'text',
      category,
      options.required ? 1 : 0,
      options.consumer_visible !== false ? 1 : 0,
      options.editable_at_style !== false ? 1 : 0,
      options.editable_at_batch !== false ? 1 : 0,
      options.editable_at_gtin !== false ? 1 : 0,
      options.editable_at_sgtin !== false ? 1 : 0,
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
    const allowedFields = ['label', 'description', 'required', 'consumer_visible', 'sort_order', 'category',
                          'editable_at_style', 'editable_at_batch', 'editable_at_gtin', 'editable_at_sgtin'];
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
  // locale = null means the default/fallback value (no language tag).
  // ROADMAP.md Phase 2: dpp_values is now unique per
  // (field_definition_id, entity_type, entity_id, locale), not just the
  // first three - a field can have one row per language plus a default.
  async setDppValue(fieldDefinitionId, entityType, entityId, value, sourceSystem = 'manual', userId = null, locale = null) {
    const sql = `
      INSERT INTO dpp_values
      (field_definition_id, entity_type, entity_id, value, locale, source_system, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(field_definition_id, entity_type, entity_id, locale)
      DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `;
    const result = await db.run(sql, [
      fieldDefinitionId,
      entityType,
      entityId,
      value,
      locale,
      sourceSystem,
      userId,
      value
    ]);
    return result.lastID;
  }

  async getDppValue(fieldDefinitionId, entityType, entityId, locale = null) {
    const sql = `
      SELECT * FROM dpp_values
      WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ? AND locale IS ?
    `;
    return db.get(sql, [fieldDefinitionId, entityType, entityId, locale]);
  }

  // locale = null returns the default/fallback values (existing callers
  // are unaffected - all data was locale=NULL before Phase 2 anyway).
  // Pass a specific locale to get that language's overrides only.
  async getEntityValues(entityType, entityId, locale = null) {
    const sql = `
      SELECT
        dv.*,
        fd.field_key,
        fd.label,
        fd.category,
        fd.data_type
      FROM dpp_values dv
      JOIN field_definitions fd ON dv.field_definition_id = fd.id
      WHERE dv.entity_type = ? AND dv.entity_id = ? AND dv.locale IS ?
      ORDER BY fd.sort_order ASC, fd.label ASC
    `;
    return db.all(sql, [entityType, entityId, locale]);
  }

  // Every locale that has at least one value set for this entity -
  // drives which language tabs the admin UI shows.
  async getAvailableLocales(entityType, entityId) {
    const sql = `
      SELECT DISTINCT locale FROM dpp_values
      WHERE entity_type = ? AND entity_id = ? AND locale IS NOT NULL
      ORDER BY locale
    `;
    const rows = await db.all(sql, [entityType, entityId]);
    return rows.map(r => r.locale);
  }

  // Stamp the current row as locked (written while its batch was already
  // produced) - see ROADMAP.md Phase 1. Purely informational for the UI;
  // history of what it changed from lives in field_change_log.
  async markValueLocked(fieldDefinitionId, entityType, entityId, locale = null) {
    const sql = `
      UPDATE dpp_values SET locked_at = CURRENT_TIMESTAMP
      WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ? AND locale IS ?
    `;
    await db.run(sql, [fieldDefinitionId, entityType, entityId, locale]);
  }

  async removeDppValue(fieldDefinitionId, entityType, entityId, locale = null) {
    const sql = `
      DELETE FROM dpp_values
      WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ? AND locale IS ?
    `;
    await db.run(sql, [fieldDefinitionId, entityType, entityId, locale]);
  }

  // Fields applicable at a given level, whether or not a value has been
  // set yet (LEFT JOIN) - used by the admin edit forms so a brand-new
  // field shows up as an empty, fillable input instead of not at all.
  // locale = null (default) reads/edits the base value. Pass a specific
  // locale to work on that language's translation instead - see
  // ROADMAP.md Phase 2.
  async getFieldsForLevel(entityType, entityId, locale = null) {
    const editableColumn = {
      style: 'editable_at_style',
      batch: 'editable_at_batch',
      gtin: 'editable_at_gtin',
      sgtin: 'editable_at_sgtin'
    }[entityType];

    if (!editableColumn) {
      throw new Error(`Invalid entity type: ${entityType}`);
    }

    const sql = `
      SELECT
        fd.id AS field_definition_id,
        fd.field_key,
        fd.label,
        fd.category,
        fd.data_type,
        fd.consumer_visible,
        dv.id AS dpp_value_id,
        dv.value
      FROM field_definitions fd
      LEFT JOIN dpp_values dv
        ON dv.field_definition_id = fd.id
        AND dv.entity_type = ?
        AND dv.entity_id = ?
        AND dv.locale IS ?
      WHERE fd.${editableColumn} = 1
      ORDER BY fd.sort_order ASC, fd.label ASC
    `;
    return db.all(sql, [entityType, entityId, locale]);
  }

  async getEntityValuesByCategory(entityType, entityId, category, locale = null) {
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
      WHERE dv.entity_type = ? AND dv.entity_id = ? AND fd.category = ? AND dv.locale IS ?
      ORDER BY fd.sort_order ASC, fd.label ASC
    `;
    return db.all(sql, [entityType, entityId, category, locale]);
  }
}

module.exports = new FieldRepository();
