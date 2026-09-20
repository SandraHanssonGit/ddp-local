const fieldRepository = require('../repositories/fields');
const batchRepository = require('../repositories/batches');
const sgtinRepository = require('../repositories/sgtins');
const batchStyleScopeRepository = require('../repositories/batch-style-scopes');
const batchGtinRepository = require('../repositories/batch-gtins');
const gtinRepository = require('../repositories/gtins');
const variantRepository = require('../repositories/variants');
const styleRepository = require('../repositories/styles');
const auditService = require('./audit-service');
const passportVersionRepository = require('../repositories/passport-versions');

const buildValueMap = (rows) => Object.fromEntries(rows.map(r => [r.field_key, r.value]));

class FieldService {
  // Create a new field definition
  async createField(fieldKey, label, category, options = {}) {
    // Validate inputs
    if (!fieldKey || !label || !category) {
      throw new Error('fieldKey, label, and category are required');
    }

    // Check if field already exists
    const existing = await fieldRepository.getFieldDefinitionByKey(fieldKey);
    if (existing) {
      throw new Error(`Field with key '${fieldKey}' already exists`);
    }

    // Validate category
    const validCategories = ['eu_required', 'nudie'];
    if (!validCategories.includes(category)) {
      throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
    }

    return fieldRepository.createFieldDefinition(fieldKey, label, category, options);
  }

  // Get all fields, optionally filtered by category
  async listFields(category = null) {
    return fieldRepository.listFieldDefinitions(category);
  }

  // Get field by ID or key
  async getField(fieldIdOrKey) {
    // Try as ID first
    if (!isNaN(fieldIdOrKey)) {
      return fieldRepository.getFieldDefinition(parseInt(fieldIdOrKey));
    }
    // Try as key
    return fieldRepository.getFieldDefinitionByKey(fieldIdOrKey);
  }

  // Update field metadata (not values)
  async updateField(fieldId, updates) {
    const field = await fieldRepository.getFieldDefinition(fieldId);
    if (!field) {
      throw new Error(`Field ${fieldId} not found`);
    }

    // role_ids (Digital Access) isn't a field_definitions column - lives
    // in the separate field_roles join table, set independently of
    // whatever other metadata changed.
    const { role_ids, ...columnUpdates } = updates;
    if (role_ids !== undefined) {
      await fieldRepository.setFieldRoles(fieldId, role_ids);
    }

    return fieldRepository.updateFieldDefinition(fieldId, columnUpdates);
  }

  // Delete a field definition - repository already refuses this if any
  // dpp_values rows reference it (values must be removed first)
  async deleteField(fieldId) {
    const field = await fieldRepository.getFieldDefinition(fieldId);
    if (!field) {
      throw new Error(`Field ${fieldId} not found`);
    }

    return fieldRepository.deleteFieldDefinition(fieldId);
  }

  // Set a value for an entity (style, batch, gtin, or sgtin)
  //
  // ROADMAP.md Phase 1: if the entity is a produced (locked) batch, or an
  // SGTIN belonging to one, the previous value is preserved in
  // field_change_log (not silently overwritten) and the new row is
  // stamped locked_at. Style/GTIN never lock - they're masterdata, not
  // tied to a specific production run.
  async setValue(entityType, entityId, fieldKey, value, options = {}) {
    // Validate entity type
    const validTypes = ['style', 'variant', 'batch', 'batch_style', 'batch_gtin', 'gtin', 'sgtin'];
    if (!validTypes.includes(entityType)) {
      throw new Error(`Invalid entity type. Must be one of: ${validTypes.join(', ')}`);
    }

    // ROADMAP.md Phase 2: locale = null is the default/fallback value
    const locale = options.locale || null;

    // Get field definition
    const fieldDef = await fieldRepository.getFieldDefinitionByKey(fieldKey);
    if (!fieldDef) {
      throw new Error(`Field '${fieldKey}' not found`);
    }

    const currentDppValue = await fieldRepository.getDppValue(fieldDef.id, entityType, entityId, locale);
    const oldValue = currentDppValue ? currentDppValue.value : null;

    const valueChanged = oldValue !== value;

    if (valueChanged) {
      await auditService.logFieldChange(
        fieldKey,
        entityType,
        entityId,
        currentDppValue ? 'updated' : 'created',
        oldValue,
        value,
        options
      );
    }

    // Phase 1 scope: only direct writes to the SGTIN itself bump its
    // passport version - not changes on an ancestor Style/Batch/GTIN
    if (valueChanged && entityType === 'sgtin') {
      await passportVersionRepository.bumpVersion(
        'sgtin',
        entityId,
        currentDppValue ? 'field_updated' : 'field_added',
        `${fieldKey} changed`
      );
    }

    const sourceSystem = options.sourceSystem || 'manual';
    const userId = options.userId || null;

    const result = await fieldRepository.setDppValue(
      fieldDef.id,
      entityType,
      entityId,
      value,
      sourceSystem,
      userId,
      locale
    );

    if (await this.isEntityLocked(entityType, entityId)) {
      await fieldRepository.markValueLocked(fieldDef.id, entityType, entityId, locale);
    }

    return result;
  }

  // Is this entity a produced (locked) batch, or an SGTIN belonging to one?
  // Style and GTIN are masterdata and never lock.
  async isEntityLocked(entityType, entityId) {
    if (entityType === 'batch') {
      const batch = await batchRepository.getById(entityId);
      return !!(batch && batch.produced_at);
    }

    if (entityType === 'batch_style') {
      const scope = await batchStyleScopeRepository.getById(entityId);
      if (!scope) return false;
      const batch = await batchRepository.getById(scope.batch_id);
      return !!(batch && batch.produced_at);
    }

    if (entityType === 'batch_gtin') {
      const batchGtin = await batchGtinRepository.getById(entityId);
      if (!batchGtin) return false;
      const batch = await batchRepository.getById(batchGtin.batch_id);
      return !!(batch && batch.produced_at);
    }

    if (entityType === 'sgtin') {
      const sgtin = await sgtinRepository.getById(entityId);
      if (!sgtin) return false;
      const batch = await batchRepository.getById(sgtin.batch_id);
      return !!(batch && batch.produced_at);
    }

    return false;
  }

  // Get value for a specific entity and field
  async getValue(entityType, entityId, fieldKey) {
    const fieldDef = await fieldRepository.getFieldDefinitionByKey(fieldKey);
    if (!fieldDef) {
      return null;
    }

    const dppValue = await fieldRepository.getDppValue(fieldDef.id, entityType, entityId);
    return dppValue ? dppValue.value : null;
  }

  // Get all values for an entity
  async getEntityValues(entityType, entityId) {
    return fieldRepository.getEntityValues(entityType, entityId);
  }

  // Get values grouped by category
  async getEntityValuesByCategory(entityType, entityId, category = null) {
    if (category) {
      return fieldRepository.getEntityValuesByCategory(entityType, entityId, category);
    }

    // Get all categories
    const allValues = await fieldRepository.getEntityValues(entityType, entityId);
    const grouped = {};

    for (const value of allValues) {
      if (!grouped[value.category]) {
        grouped[value.category] = [];
      }
      grouped[value.category].push(value);
    }

    return grouped;
  }

  // Remove a value (creates an override removal record)
  async removeValue(entityType, entityId, fieldKey) {
    const fieldDef = await fieldRepository.getFieldDefinitionByKey(fieldKey);
    if (!fieldDef) {
      throw new Error(`Field '${fieldKey}' not found`);
    }

    return fieldRepository.removeDppValue(fieldDef.id, entityType, entityId);
  }

  // Get fields for an entity with their current values
  async getEntityFieldsWithValues(entityType, entityId) {
    const values = await fieldRepository.getEntityValues(entityType, entityId);
    const valueMap = new Map();

    for (const val of values) {
      valueMap.set(val.field_key, val);
    }

    // Get all field definitions
    const allFields = await fieldRepository.listFieldDefinitions();

    // Combine fields with values
    return allFields.map(field => ({
      ...field,
      currentValue: valueMap.get(field.field_key)?.value || null,
      hasValue: valueMap.has(field.field_key)
    }));
  }

  // Freeze-at-production (ROADMAP.md, design confirmed 2026-09-19):
  // called when a Batch is marked produced. For every GTIN actually in
  // the batch, and every field with locks_at_production = 1, resolve
  // TODAY's effective value the way a live GTIN passport would (GTIN's
  // own explicit value, else Variant, else Style - "Gtin hämtar vid
  // låsning in data från Master GTIN om något finns där") and write it
  // explicitly at Batch×GTIN (entity_type='batch_gtin', entity_id =
  // the batch_gtins row), stamped locked_at. Batch×GTIN already
  // outranks plain GTIN in passport-resolver.js's precedence, so a
  // later edit to the GTIN's own master data can no longer leak into
  // this batch's passport.
  //
  // Never overwrites a batch_gtin value that's already explicitly set
  // (e.g. from a manual pre-production override) - freezing only fills
  // in what would otherwise still be resolved live from GTIN/Variant/
  // Style. Fields with nothing to resolve (no value anywhere in the
  // chain) are silently skipped, not written as empty.
  async freezeBatchAtProduction(batchId, options = {}) {
    const batchGtins = await batchGtinRepository.listForBatch(batchId);
    const allFields = await fieldRepository.listFieldDefinitions();
    const lockingFields = allFields.filter(f => f.locks_at_production);
    if (lockingFields.length === 0 || batchGtins.length === 0) return { frozen: 0 };

    const reason = options.reason || 'Batch marked as produced';
    const userId = options.userId || null;
    let frozen = 0;

    for (const batchGtin of batchGtins) {
      const gtin = await gtinRepository.getById(batchGtin.gtin_id);
      if (!gtin) continue;
      const variant = gtin.variant_id ? await variantRepository.getById(gtin.variant_id) : null;
      const style = await styleRepository.getById(gtin.style_id);

      const gtinValues = buildValueMap(await fieldRepository.getEntityValues('gtin', gtin.id));
      const variantValues = variant ? buildValueMap(await fieldRepository.getEntityValues('variant', variant.id)) : {};
      const styleValues = style ? buildValueMap(await fieldRepository.getEntityValues('style', style.id)) : {};
      const existingBatchGtinValues = buildValueMap(await fieldRepository.getEntityValues('batch_gtin', batchGtin.id));

      for (const fieldDef of lockingFields) {
        // Already has its own explicit value at this scope (e.g. a
        // pre-production override) - freezing must not clobber it.
        if (existingBatchGtinValues[fieldDef.field_key] !== undefined) continue;

        const resolvedValue = gtinValues[fieldDef.field_key] || variantValues[fieldDef.field_key] || styleValues[fieldDef.field_key];
        if (!resolvedValue) continue;

        await fieldRepository.setDppValue(fieldDef.id, 'batch_gtin', batchGtin.id, resolvedValue, 'manual', userId, null);
        await fieldRepository.markValueLocked(fieldDef.id, 'batch_gtin', batchGtin.id, null);
        await auditService.logFieldChange(
          fieldDef.field_key,
          'batch_gtin',
          batchGtin.id,
          'locked',
          null,
          resolvedValue,
          { userId, reason }
        );
        frozen++;
      }
    }

    return { frozen };
  }
}

module.exports = new FieldService();
