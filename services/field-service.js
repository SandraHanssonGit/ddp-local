const fieldRepository = require('../repositories/fields');
const { v4: uuidv4 } = require('crypto').randomBytes(16).toString('hex');

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

    return fieldRepository.updateFieldDefinition(fieldId, updates);
  }

  // Set a value for an entity (style, batch, gtin, or sgtin)
  async setValue(entityType, entityId, fieldKey, value, options = {}) {
    // Validate entity type
    const validTypes = ['style', 'batch', 'gtin', 'sgtin'];
    if (!validTypes.includes(entityType)) {
      throw new Error(`Invalid entity type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Get field definition
    const fieldDef = await fieldRepository.getFieldDefinitionByKey(fieldKey);
    if (!fieldDef) {
      throw new Error(`Field '${fieldKey}' not found`);
    }

    // Set the value
    const sourceSystem = options.sourceSystem || 'manual';
    const userId = options.userId || null;

    return fieldRepository.setDppValue(
      fieldDef.id,
      entityType,
      entityId,
      value,
      sourceSystem,
      userId
    );
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
}

module.exports = new FieldService();
