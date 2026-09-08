const fieldService = require('./field-service');
const auditService = require('./audit-service');
const fieldRepository = require('../repositories/fields');

class OverrideService {
  /**
   * Create or update an override at a specific entity level
   * This records the old value before setting the new one
   */
  async setOverride(entityType, entityId, fieldKey, newValue, options = {}) {
    // Validate entity type
    const validTypes = ['batch', 'gtin', 'sgtin'];
    if (!validTypes.includes(entityType)) {
      throw new Error(`Cannot override at ${entityType} level. Only batch, gtin, sgtin allow overrides.`);
    }

    // Get field definition
    const fieldDef = await fieldRepository.getFieldDefinitionByKey(fieldKey);
    if (!fieldDef) {
      throw new Error(`Field '${fieldKey}' not found`);
    }

    // Get current value (might be null if no override exists)
    const currentDppValue = await fieldRepository.getDppValue(fieldDef.id, entityType, entityId);
    const oldValue = currentDppValue ? currentDppValue.value : null;

    // Determine action
    const action = currentDppValue ? 'updated' : 'overridden';

    // Create audit record
    const changeId = await auditService.logFieldChange(
      fieldKey,
      entityType,
      entityId,
      action,
      oldValue,
      newValue,
      options
    );

    // Set the value
    const sourceSystem = options.sourceSystem || 'manual';
    const userId = options.userId || null;

    await fieldRepository.setDppValue(
      fieldDef.id,
      entityType,
      entityId,
      newValue,
      sourceSystem,
      userId
    );

    return {
      changeId,
      entityType,
      entityId,
      fieldKey,
      oldValue,
      newValue,
      action
    };
  }

  /**
   * Remove an override - entity will revert to inheriting from parent
   */
  async removeOverride(entityType, entityId, fieldKey, options = {}) {
    // Validate entity type
    const validTypes = ['batch', 'gtin', 'sgtin'];
    if (!validTypes.includes(entityType)) {
      throw new Error(`Cannot remove override at ${entityType} level.`);
    }

    // Get field definition
    const fieldDef = await fieldRepository.getFieldDefinitionByKey(fieldKey);
    if (!fieldDef) {
      throw new Error(`Field '${fieldKey}' not found`);
    }

    // Get current override value
    const currentDppValue = await fieldRepository.getDppValue(fieldDef.id, entityType, entityId);
    if (!currentDppValue) {
      throw new Error(`No override found for ${fieldKey} at ${entityType} ${entityId}`);
    }

    const removedValue = currentDppValue.value;

    // Create audit record
    const changeId = await auditService.logFieldChange(
      fieldKey,
      entityType,
      entityId,
      'removed',
      removedValue,
      null,
      options
    );

    // Remove the value
    await fieldRepository.removeDppValue(fieldDef.id, entityType, entityId);

    return {
      changeId,
      entityType,
      entityId,
      fieldKey,
      removedValue,
      action: 'removed'
    };
  }

  /**
   * Get all overrides for an entity
   */
  async getEntityOverrides(entityType, entityId) {
    const allValues = await fieldRepository.getEntityValues(entityType, entityId);

    // Convert to include field info and mark as override
    return allValues.map(val => ({
      field_key: val.field_key,
      label: val.label,
      category: val.category,
      value: val.value,
      sourceLevel: entityType,
      createdAt: val.created_at,
      updatedAt: val.updated_at
    }));
  }

  /**
   * Get override history for an entity
   */
  async getOverrideHistory(entityType, entityId) {
    return auditService.getEntityHistory(entityType, entityId);
  }

  /**
   * Get override history for a specific field
   */
  async getFieldOverrideHistory(fieldKey, entityType, entityId) {
    return auditService.getFieldHistory(fieldKey, entityType, entityId);
  }

  /**
   * Batch set multiple overrides
   */
  async setMultipleOverrides(entityType, entityId, overrides, options = {}) {
    const changeId = options.changeId || auditService.generateChangeId();
    const results = [];

    for (const [fieldKey, newValue] of Object.entries(overrides)) {
      try {
        const result = await this.setOverride(
          entityType,
          entityId,
          fieldKey,
          newValue,
          { ...options, changeId }
        );
        results.push({ success: true, ...result });
      } catch (err) {
        results.push({ success: false, fieldKey, error: err.message });
      }
    }

    return {
      changeId,
      entityType,
      entityId,
      totalAttempted: Object.keys(overrides).length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }
}

module.exports = new OverrideService();
