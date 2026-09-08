const styleRepository = require('../repositories/styles');
const batchRepository = require('../repositories/batches');
const gtinRepository = require('../repositories/gtins');
const sgtinRepository = require('../repositories/sgtins');
const fieldRepository = require('../repositories/fields');

class PassportResolver {
  /**
   * Resolve a complete passport for an SGTIN
   * Returns resolved values with source level (style, batch, gtin, sgtin)
   */
  async resolveSgtinPassport(sgtinId) {
    // Load SGTIN
    const sgtin = await sgtinRepository.getById(sgtinId);
    if (!sgtin) {
      throw new Error(`SGTIN ${sgtinId} not found`);
    }

    // Load GTIN
    const gtin = await gtinRepository.getById(sgtin.gtin_id);
    if (!gtin) {
      throw new Error(`GTIN for SGTIN ${sgtinId} not found`);
    }

    // Load Batch
    const batch = await batchRepository.getById(gtin.batch_id);
    if (!batch) {
      throw new Error(`Batch for GTIN not found`);
    }

    // Load Style
    const style = await styleRepository.getById(batch.style_id);
    if (!style) {
      throw new Error(`Style for Batch not found`);
    }

    // Get all field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    // Load DPP values for all levels
    const styleValues = await fieldRepository.getEntityValues('style', style.id);
    const batchValues = await fieldRepository.getEntityValues('batch', batch.id);
    const gtinValues = await fieldRepository.getEntityValues('gtin', gtin.id);
    const sgtinValues = await fieldRepository.getEntityValues('sgtin', sgtin.id);

    // Build value maps for quick lookup
    const styleValueMap = this._buildValueMap(styleValues);
    const batchValueMap = this._buildValueMap(batchValues);
    const gtinValueMap = this._buildValueMap(gtinValues);
    const sgtinValueMap = this._buildValueMap(sgtinValues);

    // Resolve all fields using inheritance precedence: SGTIN > GTIN > Batch > Style
    const resolvedFields = [];

    for (const fieldDef of fieldDefinitions) {
      const resolved = this._resolveFieldValue(
        fieldDef,
        sgtinValueMap,
        gtinValueMap,
        batchValueMap,
        styleValueMap
      );
      resolvedFields.push(resolved);
    }

    return {
      sgtin,
      gtin,
      batch,
      style,
      resolvedFields,
      hierarchy: {
        styleId: style.id,
        batchId: batch.id,
        gtinId: gtin.id,
        sgtinId: sgtin.id
      }
    };
  }

  /**
   * Resolve passport for a GTIN (inherits from Batch and Style)
   */
  async resolveGtinPassport(gtinId) {
    // Load GTIN
    const gtin = await gtinRepository.getById(gtinId);
    if (!gtin) {
      throw new Error(`GTIN ${gtinId} not found`);
    }

    // Load Batch
    const batch = await batchRepository.getById(gtin.batch_id);
    if (!batch) {
      throw new Error(`Batch for GTIN not found`);
    }

    // Load Style
    const style = await styleRepository.getById(batch.style_id);
    if (!style) {
      throw new Error(`Style for Batch not found`);
    }

    // Get all field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    // Load DPP values for all levels
    const styleValues = await fieldRepository.getEntityValues('style', style.id);
    const batchValues = await fieldRepository.getEntityValues('batch', batch.id);
    const gtinValues = await fieldRepository.getEntityValues('gtin', gtin.id);

    // Build value maps
    const styleValueMap = this._buildValueMap(styleValues);
    const batchValueMap = this._buildValueMap(batchValues);
    const gtinValueMap = this._buildValueMap(gtinValues);

    // Resolve using precedence: GTIN > Batch > Style
    const resolvedFields = [];

    for (const fieldDef of fieldDefinitions) {
      const resolved = {
        ...fieldDef,
        value: null,
        sourceLevel: null,
        definedAt: []
      };

      // Check GTIN first (highest precedence)
      if (gtinValueMap.has(fieldDef.id)) {
        const val = gtinValueMap.get(fieldDef.id);
        resolved.value = val.value;
        resolved.sourceLevel = 'gtin';
        resolved.definedAt.push('gtin');
      }
      // Then Batch
      else if (batchValueMap.has(fieldDef.id)) {
        const val = batchValueMap.get(fieldDef.id);
        resolved.value = val.value;
        resolved.sourceLevel = 'batch';
        resolved.definedAt.push('batch');
      }
      // Then Style (lowest precedence)
      else if (styleValueMap.has(fieldDef.id)) {
        const val = styleValueMap.get(fieldDef.id);
        resolved.value = val.value;
        resolved.sourceLevel = 'style';
        resolved.definedAt.push('style');
      }

      resolvedFields.push(resolved);
    }

    return {
      gtin,
      batch,
      style,
      resolvedFields,
      hierarchy: {
        styleId: style.id,
        batchId: batch.id,
        gtinId: gtin.id
      }
    };
  }

  /**
   * Resolve passport for a Batch (inherits from Style)
   */
  async resolveBatchPassport(batchId) {
    // Load Batch
    const batch = await batchRepository.getById(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    // Load Style
    const style = await styleRepository.getById(batch.style_id);
    if (!style) {
      throw new Error(`Style for Batch not found`);
    }

    // Get all field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    // Load DPP values
    const styleValues = await fieldRepository.getEntityValues('style', style.id);
    const batchValues = await fieldRepository.getEntityValues('batch', batch.id);

    // Build value maps
    const styleValueMap = this._buildValueMap(styleValues);
    const batchValueMap = this._buildValueMap(batchValues);

    // Resolve using precedence: Batch > Style
    const resolvedFields = [];

    for (const fieldDef of fieldDefinitions) {
      const resolved = {
        ...fieldDef,
        value: null,
        sourceLevel: null,
        definedAt: []
      };

      // Check Batch first
      if (batchValueMap.has(fieldDef.id)) {
        const val = batchValueMap.get(fieldDef.id);
        resolved.value = val.value;
        resolved.sourceLevel = 'batch';
        resolved.definedAt.push('batch');
      }
      // Then Style
      else if (styleValueMap.has(fieldDef.id)) {
        const val = styleValueMap.get(fieldDef.id);
        resolved.value = val.value;
        resolved.sourceLevel = 'style';
        resolved.definedAt.push('style');
      }

      resolvedFields.push(resolved);
    }

    return {
      batch,
      style,
      resolvedFields,
      hierarchy: {
        styleId: style.id,
        batchId: batch.id
      }
    };
  }

  /**
   * Resolve passport for a Style (source of truth)
   */
  async resolveStylePassport(styleId) {
    // Load Style
    const style = await styleRepository.getById(styleId);
    if (!style) {
      throw new Error(`Style ${styleId} not found`);
    }

    // Get all field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    // Load DPP values for style
    const styleValues = await fieldRepository.getEntityValues('style', style.id);
    const styleValueMap = this._buildValueMap(styleValues);

    // Resolve fields
    const resolvedFields = [];

    for (const fieldDef of fieldDefinitions) {
      const resolved = {
        ...fieldDef,
        value: null,
        sourceLevel: 'style',
        definedAt: ['style']
      };

      if (styleValueMap.has(fieldDef.id)) {
        const val = styleValueMap.get(fieldDef.id);
        resolved.value = val.value;
      }

      resolvedFields.push(resolved);
    }

    return {
      style,
      resolvedFields,
      hierarchy: {
        styleId: style.id
      }
    };
  }

  /**
   * Get resolved values grouped by category
   */
  getResolvedValuesByCategory(passport) {
    const grouped = {};

    for (const field of passport.resolvedFields) {
      if (!grouped[field.category]) {
        grouped[field.category] = [];
      }

      grouped[field.category].push({
        field_key: field.field_key,
        label: field.label,
        value: field.value,
        sourceLevel: field.sourceLevel,
        consumer_visible: field.consumer_visible
      });
    }

    return grouped;
  }

  /**
   * Get inheritance tree for a field (where does it come from)
   */
  getFieldInheritanceChain(passport, fieldKey) {
    const field = passport.resolvedFields.find(f => f.field_key === fieldKey);
    if (!field) {
      return null;
    }

    return {
      field_key: fieldKey,
      label: field.label,
      resolvedValue: field.value,
      sourceLevel: field.sourceLevel,
      definedAt: field.definedAt,
      category: field.category
    };
  }

  // Private helper methods

  /**
   * Build a Map of field definition ID -> value object for quick lookup
   */
  _buildValueMap(values) {
    const map = new Map();
    for (const val of values) {
      map.set(val.field_definition_id, val);
    }
    return map;
  }

  /**
   * Resolve a single field value using inheritance precedence
   * SGTIN > GTIN > Batch > Style
   */
  _resolveFieldValue(fieldDef, sgtinMap, gtinMap, batchMap, styleMap) {
    const resolved = {
      ...fieldDef,
      value: null,
      sourceLevel: null,
      definedAt: []
    };

    // SGTIN - highest precedence
    if (sgtinMap.has(fieldDef.id)) {
      const val = sgtinMap.get(fieldDef.id);
      resolved.value = val.value;
      resolved.sourceLevel = 'sgtin';
      resolved.definedAt.push('sgtin');
    }
    // GTIN
    else if (gtinMap.has(fieldDef.id)) {
      const val = gtinMap.get(fieldDef.id);
      resolved.value = val.value;
      resolved.sourceLevel = 'gtin';
      resolved.definedAt.push('gtin');
    }
    // Batch
    else if (batchMap.has(fieldDef.id)) {
      const val = batchMap.get(fieldDef.id);
      resolved.value = val.value;
      resolved.sourceLevel = 'batch';
      resolved.definedAt.push('batch');
    }
    // Style - lowest precedence
    else if (styleMap.has(fieldDef.id)) {
      const val = styleMap.get(fieldDef.id);
      resolved.value = val.value;
      resolved.sourceLevel = 'style';
      resolved.definedAt.push('style');
    }

    return resolved;
  }
}

module.exports = new PassportResolver();
