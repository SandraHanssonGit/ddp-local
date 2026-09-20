const styleRepository = require('../repositories/styles');
const variantRepository = require('../repositories/variants');
const batchRepository = require('../repositories/batches');
const gtinRepository = require('../repositories/gtins');
const sgtinRepository = require('../repositories/sgtins');
const fieldRepository = require('../repositories/fields');
const economicOperatorRepository = require('../repositories/economic-operators');
const batchStyleScopeRepository = require('../repositories/batch-style-scopes');
const batchGtinRepository = require('../repositories/batch-gtins');

class PassportResolver {
  /**
   * Resolve a complete passport for an SGTIN
   * Inheritance: SGTIN > Batch×GTIN > GTIN > Batch×Variant >
   * Batch×Style > Batch > Variant > Style (via GTIN.style_id /
   * GTIN.variant_id - Variant is optional, e.g. jeans GTINs have no
   * variant_id, so that level is simply empty for them)
   *
   * Batch×GTIN (2026-09-19, freeze-at-production design) is the
   * snapshot level written when a Batch is marked produced - it
   * outranks plain GTIN so a later edit to the GTIN's own master data
   * can't leak into an already-produced batch's passport. Reuses the
   * existing batch_gtins row as its entity_id, same pattern as
   * batch_style_scopes for entity_type='batch_style'.
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
    const batchGtinScope = await batchGtinRepository.find(batch.id, gtin.id);

    // Get all field definitions
    const fieldDefinitions = await fieldRepository.listFieldDefinitions();

    const levels = [
      await this._loadLevelValues('sgtin', sgtin.id, locale),
      batchGtinScope ? await this._loadLevelValues('batch_gtin', batchGtinScope.id, locale) : { localized: {}, default: {} },
      await this._loadLevelValues('gtin', gtin.id, locale),
      batchVariantScope ? await this._loadLevelValues('batch_style', batchVariantScope.id, locale) : { localized: {}, default: {} },
      batchStyleScope ? await this._loadLevelValues('batch_style', batchStyleScope.id, locale) : { localized: {}, default: {} },
      await this._loadLevelValues('batch', batch.id, locale),
      variant ? await this._loadLevelValues('variant', variant.id, locale) : { localized: {}, default: {} },
      await this._loadLevelValues('style', style.id, locale)
    ];

    // Resolve all fields using inheritance precedence:
    // SGTIN > Batch×GTIN > GTIN > Batch×Variant > Batch×Style > Batch > Variant > Style
    const sourceNames = ['sgtin', 'batch_gtin', 'gtin', 'batch_variant', 'batch_style', 'batch', 'variant', 'style'];
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
      this._resolveFieldValueLocaleAware(fieldDef, levels, ['gtin', 'variant', 'style'], locale, 'editable_at_gtin')
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
  // editableColumn (optional) - e.g. 'editable_at_gtin' - includes an
  // `editable` flag on the result, for a caller that needs to know
  // whether THIS level is allowed to set the field at all (not just
  // where its value currently comes from). Omitted by callers that
  // don't need it (the public passport is read-only either way).
  _resolveFieldValueLocaleAware(fieldDef, levels, sourceNames, requestedLocale, editableColumn) {
    const editable = editableColumn ? !!fieldDef[editableColumn] : true;
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
            locale: requestedLocale,
            editable
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
          locale: null,
          editable
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
      locale: null,
      editable
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

  /**
   * Resolve EVERY field (not just ones editable at that exact level)
   * for a Style, Variant, or GTIN, scoped to one specific Batch -
   * design confirmed 2026-09-20: "man vill ju se alla fält ner till
   * den nivån man tittar på och man vill ju se alla fält som är
   * låsta" (want to see every field down to the level being viewed,
   * and want to see which ones are locked). Used by the merged Batch
   * Contents + DPP Field Values view in batch-detail.ejs - the
   * write-target for edits at this scope is always the top level
   * (Batch×GTIN for a GTIN scope, Batch×Style for Style/Variant),
   * everything lower is shown as inherited/read-only-from-here, same
   * "Inherited from X" convention already used on gtin-detail.ejs/
   * sgtin-detail.ejs.
   *
   * Unlike resolveSgtinPassport/resolveGtinPassport, this loads raw
   * dpp_values rows per level (not just a value map) so it can also
   * report `locked` per field - whichever level's row actually won.
   */
  async resolveBatchScopedFields(batchId, entityType, entityId, locale = null) {
    const batch = await batchRepository.getById(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    let gtin = null, variant = null, style = null;
    if (entityType === 'gtin') {
      gtin = await gtinRepository.getById(entityId);
      if (!gtin) throw new Error(`GTIN ${entityId} not found`);
      style = await styleRepository.getById(gtin.style_id);
      variant = gtin.variant_id ? await variantRepository.getById(gtin.variant_id) : null;
    } else if (entityType === 'variant') {
      variant = await variantRepository.getById(entityId);
      if (!variant) throw new Error(`Variant ${entityId} not found`);
      style = await styleRepository.getById(variant.style_id);
    } else if (entityType === 'style') {
      style = await styleRepository.getById(entityId);
      if (!style) throw new Error(`Style ${entityId} not found`);
    } else {
      throw new Error(`Invalid entityType for resolveBatchScopedFields: ${entityType}`);
    }
    if (!style) {
      throw new Error(`Style for ${entityType} ${entityId} not found`);
    }

    const batchGtinScope = gtin ? await batchGtinRepository.find(batch.id, gtin.id) : null;
    const batchVariantScope = variant ? await batchStyleScopeRepository.find(batch.id, style.id, variant.id) : null;
    const batchStyleScope = await batchStyleScopeRepository.find(batch.id, style.id, null);

    // Precedence order, highest first - matches passport-resolver's
    // SGTIN chain minus the SGTIN layer itself (this is a scope
    // preview, not one physical unit).
    const levelDefs = [];
    if (gtin) {
      levelDefs.push({ source: 'batch_gtin', dbEntityType: 'batch_gtin', dbEntityId: batchGtinScope ? batchGtinScope.id : null });
      levelDefs.push({ source: 'gtin', dbEntityType: 'gtin', dbEntityId: gtin.id });
    }
    if (variant) {
      levelDefs.push({ source: 'batch_variant', dbEntityType: 'batch_style', dbEntityId: batchVariantScope ? batchVariantScope.id : null });
    }
    levelDefs.push({ source: 'batch_style', dbEntityType: 'batch_style', dbEntityId: batchStyleScope ? batchStyleScope.id : null });
    levelDefs.push({ source: 'batch', dbEntityType: 'batch', dbEntityId: batch.id });
    if (variant) {
      levelDefs.push({ source: 'variant', dbEntityType: 'variant', dbEntityId: variant.id });
    }
    levelDefs.push({ source: 'style', dbEntityType: 'style', dbEntityId: style.id });

    for (const lvl of levelDefs) {
      lvl.valueMap = {};
      lvl.lockedMap = {};
      if (lvl.dbEntityId == null) continue;
      const rows = await fieldRepository.getEntityValues(lvl.dbEntityType, lvl.dbEntityId, null);
      rows.forEach(r => { lvl.valueMap[r.field_key] = r.value; lvl.lockedMap[r.field_key] = !!r.locked_at; });
      if (locale) {
        const localizedRows = await fieldRepository.getEntityValues(lvl.dbEntityType, lvl.dbEntityId, locale);
        localizedRows.forEach(r => { lvl.valueMap[r.field_key] = r.value; lvl.lockedMap[r.field_key] = !!r.locked_at; });
      }
    }

    // The one level an edit at this scope actually writes to - the
    // same entity the merged view's Save button already posts to.
    const writeTarget = gtin ? 'batch_gtin' : 'batch_style';
    // Which Levels checkbox gates writing at this scope - batch_gtin
    // (a GTIN scoped to this Batch) has its own permission, split from
    // plain GTIN masterdata per user request (2026-09-20); batch_style
    // (Style/Variant scoped to this Batch) still reuses editable_at_batch,
    // unchanged.
    const editableColumn = gtin ? 'editable_at_batch_gtin' : 'editable_at_batch';

    const fieldDefinitions = await fieldRepository.listFieldDefinitions();
    const resolvedFields = fieldDefinitions.map(fieldDef => {
      const editable = !!fieldDef[editableColumn];
      for (const lvl of levelDefs) {
        const value = lvl.valueMap[fieldDef.field_key];
        if (value) {
          return {
            // field_key (snake_case) matches fieldRepository.getFieldsForLevel's
            // shape, since batch-detail.ejs's template renders both the
            // whole-batch (getFieldsForLevel) and scoped (this method)
            // results through the same markup.
            field_key: fieldDef.field_key,
            label: fieldDef.label,
            category: fieldDef.category,
            value,
            source: lvl.source,
            locked: !!lvl.lockedMap[fieldDef.field_key],
            set_at_this_scope: lvl.source === writeTarget,
            editable
          };
        }
      }
      return {
        field_key: fieldDef.field_key,
        label: fieldDef.label,
        category: fieldDef.category,
        value: undefined,
        source: null,
        locked: false,
        set_at_this_scope: false,
        editable
      };
    });

    return { batch, style, variant, gtin, entityType, resolvedFields };
  }
}

module.exports = new PassportResolver();
