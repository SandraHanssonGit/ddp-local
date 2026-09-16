const styleRepository = require('../repositories/styles');
const variantRepository = require('../repositories/variants');
const batchRepository = require('../repositories/batches');
const gtinRepository = require('../repositories/gtins');
const sgtinRepository = require('../repositories/sgtins');
const fieldRepository = require('../repositories/fields');
const economicOperatorRepository = require('../repositories/economic-operators');
const batchStyleScopeRepository = require('../repositories/batch-style-scopes');

class PassportResolver {
  /**
   * Resolve a complete passport for an SGTIN
   * Inheritance: SGTIN > GTIN > Batch > Variant > Style (via
   * GTIN.style_id / GTIN.variant_id - Variant is optional, e.g. jeans
   * GTINs have no variant_id, so that level is simply empty for them)
   *
   * ROADMAP.md Phase 2: locale is resolved language-first, then level -
   * if a translation exists ANYWHERE in the chain, it wins over a
   * default-language value at a higher-precedence level. Only once no
   * level has a translation does resolution fall back to the default
   * (locale = null) chain. Pass locale = null (default) for the
   * original, language-free behavior.
   */
  async resolveSgtinPassport(sgtinId, locale = null) {
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

    // Load Variant, if this GTIN has one (not all product types do)
    const variant = gtin.variant_id ? await variantRepository.getById(gtin.variant_id) : null;

    // ROADMAP.md: a Batch can span multiple Styles/Variants, so a plain
    // Batch-level override applies to the whole batch. These two scopes
    // let an override be narrowed to just this GTIN's Style within the
    // batch, or even just its Variant within the batch - both read-only
    // lookups (`find`, not `getOrCreate`), since merely resolving a
    // passport must never create a scope row.
    const batchVariantScope = variant ? await batchStyleScopeRepository.find(batch.id, style.id, variant.id) : null;
    const batchStyleScope = await batchStyleScopeRepository.find(batch.id, style.id, null);

    // Get all field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    const levels = [
      await this._loadLevelValues('sgtin', sgtin.id, locale),
      await this._loadLevelValues('gtin', gtin.id, locale),
      batchVariantScope ? await this._loadLevelValues('batch_style', batchVariantScope.id, locale) : { localized: {}, default: {} },
      batchStyleScope ? await this._loadLevelValues('batch_style', batchStyleScope.id, locale) : { localized: {}, default: {} },
      await this._loadLevelValues('batch', batch.id, locale),
      variant ? await this._loadLevelValues('variant', variant.id, locale) : { localized: {}, default: {} },
      await this._loadLevelValues('style', style.id, locale)
    ];

    // Resolve all fields using inheritance precedence:
    // SGTIN > GTIN > Batch×Variant > Batch×Style > Batch > Variant > Style
    const sourceNames = ['sgtin', 'gtin', 'batch_variant', 'batch_style', 'batch', 'variant', 'style'];
    const resolvedFields = fieldDefinitions.map(fieldDef =>
      this._resolveFieldValueLocaleAware(fieldDef, levels, sourceNames, locale)
    );

    // ROADMAP.md Phase 4: economic operator (manufacturer/importer/
    // authorized representative) - Batch overrides Style, same
    // precedence pattern as everywhere else.
    const economicOperator = await economicOperatorRepository.resolveForBatchAndStyle(batch.operator_id, style.operator_id);

    return {
      sgtin,
      gtin,
      batch,
      variant,
      style,
      economicOperator,
      resolvedFields,
      hierarchy: {
        styleId: style.id,
        variantId: variant ? variant.id : null,
        batchId: batch.id,
        gtinId: gtin.id,
        sgtinId: sgtin.id
      }
    };
  }

  /**
   * Resolve passport for a GTIN (inherits from Batch, Variant, and Style)
   * Inheritance: GTIN > Batch > Variant > Style
   */
  async resolveGtinPassport(gtinId, locale = null) {
    // Load GTIN
    const gtin = await gtinRepository.getById(gtinId);
    if (!gtin) {
      throw new Error(`GTIN ${gtinId} not found`);
    }

    // Load Style (from GTIN.style_id)
    const style = await styleRepository.getById(gtin.style_id);
    if (!style) {
      throw new Error(`Style for GTIN not found`);
    }

    // Load Variant, if this GTIN has one
    const variant = gtin.variant_id ? await variantRepository.getById(gtin.variant_id) : null;

    // Get all field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    // NOTE: no Batch level here - GTINs are masterdata with no batch_id
    // (a GTIN can appear in several batches via batch_gtins), so there's
    // no single "the batch" to resolve against without an SGTIN pinning
    // one down. Was previously reading a gtin.batch_id that doesn't
    // exist in the schema, which meant this method always threw -
    // fixed while adding Variant support.
    const levels = [
      await this._loadLevelValues('gtin', gtin.id, locale),
      variant ? await this._loadLevelValues('variant', variant.id, locale) : { localized: {}, default: {} },
      await this._loadLevelValues('style', style.id, locale)
    ];

    // Resolve all fields: GTIN > Variant > Style
    const resolvedFields = fieldDefinitions.map(fieldDef =>
      this._resolveFieldValueLocaleAware(fieldDef, levels, ['gtin', 'variant', 'style'], locale)
    );

    return {
      gtin,
      variant,
      style,
      resolvedFields,
      hierarchy: {
        styleId: style.id,
        variantId: variant ? variant.id : null,
        gtinId: gtin.id
      }
    };
  }

  /**
   * Resolve passport for a Batch
   * Shows all unique GTINs in batch grouped by style
   */
  async resolveBatchPassport(batchId, locale = null) {
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
    const batchLevel = await this._loadLevelValues('batch', batch.id, locale);

    // For each style, resolve passport
    const passportsByStyle = {};
    for (const [styleId, gtinList] of Object.entries(gtinsByStyle)) {
      const style = styles[styleId];
      const styleLevel = await this._loadLevelValues('style', style.id, locale);

      const levels = [{ localized: {}, default: {} }, batchLevel, styleLevel, { localized: {}, default: {} }];
      const resolvedFields = fieldDefinitions.map(fieldDef =>
        this._resolveFieldValueLocaleAware(fieldDef, levels, [null, 'batch', 'style', null], locale)
      );

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
  async resolveStylePassport(styleId, locale = null) {
    // Load Style
    const style = await styleRepository.getById(styleId);
    if (!style) {
      throw new Error(`Style ${styleId} not found`);
    }

    // Get all field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    // Load style-level values
    const styleLevel = await this._loadLevelValues('style', styleId, locale);
    const levels = [{ localized: {}, default: {} }, { localized: {}, default: {} }, styleLevel, { localized: {}, default: {} }];

    // Resolve all fields (style only)
    const resolvedFields = fieldDefinitions.map(fieldDef =>
      this._resolveFieldValueLocaleAware(fieldDef, levels, [null, null, 'style', null], locale)
    );

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
   * ROADMAP.md Phase 2 helper: load both the default (locale=null) and
   * requested-locale value maps for one entity. If no locale is
   * requested, the localized map is left empty - no extra query, and
   * resolution below falls straight to the default map, unchanged from
   * pre-Phase-2 behavior.
   */
  async _loadLevelValues(entityType, entityId, locale) {
    const defaultValues = await fieldRepository.getEntityValues(entityType, entityId, null);
    const defaultMap = this._buildValueMap(defaultValues);

    if (!locale) {
      return { localized: {}, default: defaultMap };
    }

    const localizedValues = await fieldRepository.getEntityValues(entityType, entityId, locale);
    const localizedMap = this._buildValueMap(localizedValues);
    return { localized: localizedMap, default: defaultMap };
  }

  /**
   * ROADMAP.md Phase 2: language-first, then level. If a translation
   * exists at ANY level for the requested locale, it wins over a
   * default-language value at a higher-precedence level. Only when no
   * level has a translation does resolution fall back to the default
   * (locale = null) chain, in the same level precedence.
   */
  _resolveFieldValueLocaleAware(fieldDef, levels, sourceNames, requestedLocale) {
    if (requestedLocale) {
      for (let i = 0; i < levels.length; i++) {
        const v = levels[i].localized[fieldDef.field_key];
        if (v) {
          return {
            fieldId: fieldDef.id,
            fieldKey: fieldDef.field_key,
            label: fieldDef.label,
            value: v,
            source: sourceNames[i],
            category: fieldDef.category,
            dataType: fieldDef.data_type,
            locale: requestedLocale
          };
        }
      }
    }

    for (let i = 0; i < levels.length; i++) {
      const v = levels[i].default[fieldDef.field_key];
      if (v) {
        return {
          fieldId: fieldDef.id,
          fieldKey: fieldDef.field_key,
          label: fieldDef.label,
          value: v,
          source: sourceNames[i],
          category: fieldDef.category,
          dataType: fieldDef.data_type,
          locale: null
        };
      }
    }

    return {
      fieldId: fieldDef.id,
      fieldKey: fieldDef.field_key,
      label: fieldDef.label,
      value: undefined,
      source: null,
      category: fieldDef.category,
      dataType: fieldDef.data_type,
      locale: null
    };
  }

  /**
   * Helper: Resolve a single field value through inheritance levels
   * Returns { fieldId, fieldKey, label, value, source, category }
   * source can be: sgtin, gtin, batch, style (or null if undefined)
   * @deprecated kept for reference; all resolve*Passport methods now
   * use _resolveFieldValueLocaleAware for Phase 2 language support
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
