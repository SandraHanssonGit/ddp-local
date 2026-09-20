const db = require('../db/init-v2');

class FieldRepository {
  // Field Definitions
  async createFieldDefinition(fieldKey, label, category, options = {}) {
    const sql = `
      INSERT INTO field_definitions
      (field_key, label, description, data_type, category, required,
       editable_at_style, editable_at_variant, editable_at_batch, editable_at_gtin, editable_at_sgtin,
       locks_at_production, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    // No explicit locks_at_production given - default from category,
    // same rule the startup backfill uses (migrateLocksAtProduction in
    // db/init-v2.js) so a brand-new field behaves the same as an
    // existing one that's never been touched.
    const locksAtProduction = options.locks_at_production !== undefined
      ? (options.locks_at_production ? 1 : 0)
      : (category === 'eu_required' ? 1 : 0);
    const result = await db.run(sql, [
      fieldKey,
      label,
      options.description || '',
      options.data_type || 'text',
      category,
      options.required ? 1 : 0,
      options.editable_at_style !== false ? 1 : 0,
      options.editable_at_variant !== false ? 1 : 0,
      options.editable_at_batch !== false ? 1 : 0,
      options.editable_at_gtin !== false ? 1 : 0,
      options.editable_at_sgtin !== false ? 1 : 0,
      locksAtProduction,
      options.sort_order || 0
    ]);
    // Digital Access (2026-09-20): which roles see this field, replacing
    // the old consumer_visible/authority_visible booleans. Defaults to
    // every existing role if the caller doesn't say - matches the old
    // defaults (both flags true unless explicitly set false).
    const roleIds = options.role_ids !== undefined
      ? options.role_ids
      : (await this.listRoles()).map(r => r.id);
    await this.setFieldRoles(result.lastID, roleIds);
    return result.lastID;
  }

  // Digital Access: configurable roles (Consumer, Authority, Recycler,
  // ...), managed under Settings. is_default marks the role shown when
  // no ?role= is given on the public passport - never deleted.
  async listRoles() {
    return db.all(`SELECT * FROM roles ORDER BY sort_order ASC, label ASC`);
  }

  async getRole(roleId) {
    return db.get(`SELECT * FROM roles WHERE id = ?`, [roleId]);
  }

  async getRoleByKey(roleKey) {
    return db.get(`SELECT * FROM roles WHERE role_key = ?`, [roleKey]);
  }

  async getDefaultRole() {
    return db.get(`SELECT * FROM roles WHERE is_default = 1`);
  }

  async createRole(roleKey, label, options = {}) {
    const result = await db.run(
      `INSERT INTO roles (role_key, label, requires_auth, sort_order) VALUES (?, ?, ?, ?)`,
      [roleKey, label, options.requires_auth ? 1 : 0, options.sort_order || 0]
    );
    return result.lastID;
  }

  async updateRole(roleId, updates) {
    const allowedFields = ['label', 'requires_auth', 'sort_order'];
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (setClauses.length === 0) return;
    values.push(roleId);
    await db.run(`UPDATE roles SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
  }

  async deleteRole(roleId) {
    const role = await this.getRole(roleId);
    if (role && role.is_default) {
      throw new Error('Cannot delete the default role');
    }
    await db.run(`DELETE FROM field_roles WHERE role_id = ?`, [roleId]);
    await db.run(`DELETE FROM roles WHERE id = ?`, [roleId]);
  }

  async getFieldRoleIds(fieldDefinitionId) {
    const rows = await db.all(`SELECT role_id FROM field_roles WHERE field_definition_id = ?`, [fieldDefinitionId]);
    return rows.map(r => r.role_id);
  }

  // Replace-all: simpler and safer than diffing when a form always
  // posts the full set of checked roles.
  async setFieldRoles(fieldDefinitionId, roleIds) {
    await db.run(`DELETE FROM field_roles WHERE field_definition_id = ?`, [fieldDefinitionId]);
    for (const roleId of roleIds) {
      await db.run(`INSERT OR IGNORE INTO field_roles (field_definition_id, role_id) VALUES (?, ?)`, [fieldDefinitionId, roleId]);
    }
  }

  // Every field_key visible to a given role, keyed for a cheap filter
  // lookup (passport-page-service.js) - a field with no field_roles
  // rows at all is visible to nobody, same as the old flags defaulting
  // to "off" once explicitly unchecked.
  async getFieldKeysForRole(roleId) {
    const rows = await db.all(
      `SELECT fd.field_key FROM field_roles fr JOIN field_definitions fd ON fd.id = fr.field_definition_id WHERE fr.role_id = ?`,
      [roleId]
    );
    return rows.map(r => r.field_key);
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

    sql += ` ORDER BY category ASC, sort_order ASC, label ASC`;
    const fields = await db.all(sql, params);

    // Attach each field's role_ids (Digital Access) - one extra query
    // per field is fine at this POC's field-definitions scale (a
    // handful of rows), and keeps this simple rather than a manual
    // GROUP_CONCAT parse.
    for (const field of fields) {
      field.role_ids = await this.getFieldRoleIds(field.id);
    }
    return fields;
  }

  async updateFieldDefinition(fieldId, updates) {
    const allowedFields = ['label', 'description', 'required', 'sort_order', 'category',
                          'editable_at_style', 'editable_at_variant', 'editable_at_batch', 'editable_at_gtin', 'editable_at_sgtin',
                          'locks_at_production'];
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
  // Bug found 2026-09-19: `dpp_values` is UNIQUE(field_definition_id,
  // entity_type, entity_id, locale), but SQLite treats every NULL
  // `locale` as distinct from every other NULL for uniqueness purposes
  // - the default (non-localized) value is by far the most common case.
  // The old `INSERT ... ON CONFLICT(...) DO UPDATE` therefore never
  // matched an existing default-locale row and silently inserted a new
  // duplicate on every edit past the first. Fixed with an explicit
  // SELECT-then-UPDATE-or-INSERT instead - the same pattern already
  // used in repositories/batch-style-scopes.js for the identical
  // NULL-uniqueness quirk on `variant_id`.
  async setDppValue(fieldDefinitionId, entityType, entityId, value, sourceSystem = 'manual', userId = null, locale = null) {
    const existing = await db.get(
      `SELECT id FROM dpp_values WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ? AND locale IS ?`,
      [fieldDefinitionId, entityType, entityId, locale]
    );

    if (existing) {
      // Matches the original ON CONFLICT clause's intent - only value
      // and updated_at change on an edit; source_system/created_by
      // stay as whoever/whatever first created this row.
      await db.run(
        `UPDATE dpp_values SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [value, existing.id]
      );
      return existing.id;
    }

    const result = await db.run(
      `INSERT INTO dpp_values
       (field_definition_id, entity_type, entity_id, value, locale, source_system, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fieldDefinitionId, entityType, entityId, value, locale, sourceSystem, userId]
    );
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
      variant: 'editable_at_variant',
      batch: 'editable_at_batch',
      // batch_style scopes a Batch-level override to one Style/Variant
      // within that batch - same "can this field be set at Batch?"
      // permission, just narrower scope. Not a separate checkbox.
      batch_style: 'editable_at_batch',
      gtin: 'editable_at_gtin',
      // batch_gtin is the freeze-at-production snapshot level (2026-09-19)
      // - a GTIN-level value narrowed to one specific Batch. Same
      // "can this field be set at GTIN?" permission as plain gtin.
      batch_gtin: 'editable_at_gtin',
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
        fd.data_type
      FROM dpp_values dv
      JOIN field_definitions fd ON dv.field_definition_id = fd.id
      WHERE dv.entity_type = ? AND dv.entity_id = ? AND fd.category = ? AND dv.locale IS ?
      ORDER BY fd.sort_order ASC, fd.label ASC
    `;
    return db.all(sql, [entityType, entityId, category, locale]);
  }
}

module.exports = new FieldRepository();
