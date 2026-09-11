const styleRepository = require('../repositories/styles');
const batchRepository = require('../repositories/batches');
const gtinRepository = require('../repositories/gtins');
const sgtinRepository = require('../repositories/sgtins');
const fieldRepository = require('../repositories/fields');

class PassportResolver {
  /**
   * Resolve a complete passport for an SGTIN
   * Inheritance: SGTIN > GTIN > Batch > Style (via GTIN.style_id)
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

    // Load Batch (from SGTIN.batch_id, not GTIN.batch_id - v2 architecture)
    const batch = await batchRepository.getById(sgtin.batch_id);
    if (!batch) {
      throw new Error(`Batch for SGTIN not found`);
    }

    // Load Style (from GTIN.style_id, not Batch.style_id)
    const style = await styleRepository.getById(gtin.style_id);
    if (!style) {
      throw new Error(`Style for GTIN not found`);
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
   * Inheritance: GTIN > Batch > Style (via GTIN.style_id)
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

    // Load Style (from GTIN.style_id)
    const style = await styleRepository.getById(gtin.style_id);
    if (!style) {
      throw new Error(`Style for GTIN not found`);
    }

    // Get all field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    // Load DPP values
    const styleValues = await fieldRepository.getEntityValues('style', style.id);
    const batchValues = await fieldRepository.getEntityValues('batch', batch.id);
    const gtinValues = await fieldRepository.getEntityValues('gtin', gtin.id);

    // Build value maps
    const styleValueMap = this._buildValueMap(styleValues);
    const batchValueMap = this._buildValueMap(batchValues);
    const gtinValueMap = this._buildValueMap(gtinValues);
    const emptyMap = {};

    // Resolve all fields: GTIN > Batch > Style
    const resolvedFields = [];

    for (const fieldDef of fieldDefinitions) {
      const resolved = this._resolveFieldValue(
        fieldDef,
        gtinValueMap,
        batchValueMap,
        styleValueMap,
        emptyMap
      );
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
   * Resolve passport for a Batch
   * Shows all unique GTINs in batch grouped by style
   */
  async resolveBatchPassport(batchId) {
    // Load Batch
    const batch = await batchRepository.getById(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    // Load all GTINs in this batch
    const gtins = await gtinRepository.listByBatch(batchId);
    if (!gtins || gtins.length === 0) {
      throw new Error(`No GTINs found for Batch ${batchId}`);
    }

    // Group GTINs by style
    const gtinsByStyle = {};
    for (const gtin of gtins) {
      if (!gtinsByStyle[gtin.style_id]) {
        gtinsByStyle[gtin.style_id] = [];
      }
      gtinsByStyle[gtin.style_id].push(gtin);
    }

    // Load all unique styles
    const styles = {};
    for (const styleId of Object.keys(gtinsByStyle)) {
      styles[styleId] = await styleRepository.getById(parseInt(styleId));
    }

    // Get field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    // Load batch-level values
    const batchValues = await fieldRepository.getEntityValues('batch', batch.id);
    const batchValueMap = this._buildValueMap(batchValues);

    // For each style, resolve passport
    const passportsByStyle = {};
    for (const [styleId, gtinList] of Object.entries(gtinsByStyle)) {
      const style = styles[styleId];
      const styleValues = await fieldRepository.getEntityValues('style', style.id);
      const styleValueMap = this._buildValueMap(styleValues);

      const resolvedFields = [];
      for (const fieldDef of fieldDefinitions) {
        // Batch > Style (no GTIN/SGTIN)
        const resolved = this._resolveFieldValue(
          fieldDef,
          {},
          batchValueMap,
          styleValueMap,
          {}
        );
        resolvedFields.push(resolved);
      }

      passportsByStyle[styleId] = {
        style,
        gtins: gtinList,
        resolvedFields
      };
    }

    return {
      batch,
      passportsByStyle,
      hierarchy: {
        batchId: batch.id,
        styleCount: Object.keys(styles).length,
        gtinCount: gtins.length
      }
    };
  }

  /**
   * Resolve passport for a Style
   */
  async resolveStylePassport(styleId) {
    // Load Style
    const style = await styleRepository.getById(styleId);
    if (!style) {
      throw new Error(`Style ${styleId} not found`);
    }

    // Get all field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    // Load style-level values
    const styleValues = await fieldRepository.getEntityValues('style', styleId);
    const styleValueMap = this._buildValueMap(styleValues);

    // Resolve all fields (style only)
    const resolvedFields = [];
    for (const fieldDef of fieldDefinitions) {
      const resolved = {
        fieldId: fieldDef.id,
        fieldKey: fieldDef.field_key,
        label: fieldDef.label,
        value: styleValueMap[fieldDef.field_key] || null,
        source: styleValueMap[fieldDef.field_key] ? 'style' : null,
        category: fieldDef.category
      };
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
   * Helper: Build a map of field_key -> value from entity values
   */
  _buildValueMap(values) {
    const map = {};
    if (values && values.length > 0) {
      for (const v of values) {
        map[v.field_key] = v.value;
      }
    }
    return map;
  }

  /**
   * Helper: Resolve a single field value through inheritance levels
   * Returns { fieldId, fieldKey, label, value, source, category }
   * source can be: sgtin, gtin, batch, style (or null if undefined)
   */
  _resolveFieldValue(fieldDef, level1Map, level2Map, level3Map, level4Map, sourceNames = ['sgtin', 'gtin', 'batch', 'style']) {
    // Try each level in precedence order
    let value = level1Map[fieldDef.field_key];
    let source = value ? sourceNames[0] : null;

    if (!value) {
      value = level2Map[fieldDef.field_key];
      source = value ? sourceNames[1] : null;
    }

    if (!value) {
      value = level3Map[fieldDef.field_key];
      source = value ? sourceNames[2] : null;
    }

    if (!value) {
      value = level4Map[fieldDef.field_key];
      source = value ? sourceNames[3] : null;
    }

    return {
      fieldId: fieldDef.id,
      fieldKey: fieldDef.field_key,
      label: fieldDef.label,
      value,
      source,
      category: fieldDef.category,
      dataType: fieldDef.data_type
    };
  }
}

module.exports = new PassportResolver();
