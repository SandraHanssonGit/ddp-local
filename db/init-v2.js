const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || 'data/dpp-v2.db';
const db = new sqlite3.Database(DB_PATH);

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const init = () => {
  db.serialize(() => {
    console.log(`[DPP v2] Initializing database: ${DB_PATH}`);

    // Phase 1: Core Hierarchy
    // Table: styles
    db.run(`
      CREATE TABLE IF NOT EXISTS styles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        style_number TEXT NOT NULL UNIQUE,
        product_name TEXT,
        product_type TEXT,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[styles]', err);
      else console.log('✓ styles table');
    });

    // Table: batches
    // NOTE: Batch is independent of Style - can contain GTINs from multiple styles
    db.run(`
      CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL UNIQUE,
        production_order TEXT,
        production_date DATE,
        supplier TEXT,
        factory TEXT,
        country_of_production TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[batches]', err);
      else console.log('✓ batches table');
    });

    // Table: variants
    // Represents product variants (e.g., Red, Blue for t-shirts)
    // For jeans: no variants (variant_id is NULL on GTINs)
    // For topwear: each variant gets its own set of GTINs per size
    db.run(`
      CREATE TABLE IF NOT EXISTS variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        style_id INTEGER NOT NULL,
        variant_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (style_id) REFERENCES styles(id),
        UNIQUE(style_id, variant_name)
      )
    `, (err) => {
      if (err) console.error('[variants]', err);
      else console.log('✓ variants table');
    });

    // Table: gtins
    // Masterdata: Product SKUs (Style + Size, or Style + Variant + Size)
    // GTIN is globally unique (EAN-14)
    // No batch_id here - batches reference GTINs via SGTINs
    db.run(`
      CREATE TABLE IF NOT EXISTS gtins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        style_id INTEGER NOT NULL,
        variant_id INTEGER,
        gtin TEXT NOT NULL UNIQUE,
        size TEXT,
        color TEXT,
        variant TEXT,
        product_type TEXT,
        item_number TEXT,
        size_value_1 TEXT,
        size_value_2 TEXT,
        size_value_3 TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (style_id) REFERENCES styles(id),
        FOREIGN KEY (variant_id) REFERENCES variants(id)
      )
    `, (err) => {
      if (err) console.error('[gtins]', err);
      else console.log('✓ gtins table');
    });

    // Table: sgtins
    // Individual garments: links GTIN × Batch × Serial
    // One SGTIN = one physical garment with unique serial number
    // Batch_id specifies which production batch this garment came from
    db.run(`
      CREATE TABLE IF NOT EXISTS sgtins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gtin_id INTEGER NOT NULL,
        batch_id INTEGER NOT NULL,
        serial_number TEXT NOT NULL,
        sgtin TEXT UNIQUE,
        rfid_id TEXT,
        qc_status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gtin_id) REFERENCES gtins(id),
        FOREIGN KEY (batch_id) REFERENCES batches(id),
        UNIQUE(gtin_id, serial_number)
      )
    `, (err) => {
      if (err) console.error('[sgtins]', err);
      else console.log('✓ sgtins table');
    });

    // Table: batch_gtins (batch planning: which GTINs in which quantities)
    db.run(`
      CREATE TABLE IF NOT EXISTS batch_gtins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL,
        gtin_id INTEGER NOT NULL,
        planned_quantity INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES batches(id),
        FOREIGN KEY (gtin_id) REFERENCES gtins(id),
        UNIQUE(batch_id, gtin_id)
      )
    `, (err) => {
      if (err) console.error('[batch_gtins]', err);
      else console.log('✓ batch_gtins table');
    });

    // Phase 2: Dynamic Fields
    // Table: field_definitions
    db.run(`
      CREATE TABLE IF NOT EXISTS field_definitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        field_key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT,
        data_type TEXT DEFAULT 'text',
        category TEXT,
        required BOOLEAN DEFAULT 0,
        consumer_visible BOOLEAN DEFAULT 1,
        editable_at_style BOOLEAN DEFAULT 1,
        editable_at_batch BOOLEAN DEFAULT 1,
        editable_at_gtin BOOLEAN DEFAULT 1,
        editable_at_sgtin BOOLEAN DEFAULT 1,
        valid_from DATETIME,
        valid_until DATETIME,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[field_definitions]', err);
      else console.log('✓ field_definitions table');
    });

    // Table: dpp_values
    db.run(`
      CREATE TABLE IF NOT EXISTS dpp_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        field_definition_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        value TEXT,
        source_system TEXT DEFAULT 'manual',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id),
        UNIQUE(field_definition_id, entity_type, entity_id)
      )
    `, (err) => {
      if (err) console.error('[dpp_values]', err);
      else console.log('✓ dpp_values table');
    });

    // Phase 5: Audit Trail
    // Table: field_change_log
    db.run(`
      CREATE TABLE IF NOT EXISTS field_change_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        change_id TEXT NOT NULL,
        field_definition_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        user_id TEXT,
        reason TEXT,
        source_system TEXT DEFAULT 'manual',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id)
      )
    `, (err) => {
      if (err) console.error('[field_change_log]', err);
      else console.log('✓ field_change_log table');
    });

    // Phase 7: Lifecycle Events
    // Table: lifecycle_events
    db.run(`
      CREATE TABLE IF NOT EXISTS lifecycle_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sgtin_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT,
        source_system TEXT DEFAULT 'manual',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sgtin_id) REFERENCES sgtins(id)
      )
    `, (err) => {
      if (err) console.error('[lifecycle_events]', err);
      else console.log('✓ lifecycle_events table');
    });

    // Phase 7b: Scan Tracking
    // Table: scan_events (track when and where products are scanned)
    db.run(`
      CREATE TABLE IF NOT EXISTS scan_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sgtin_id INTEGER NOT NULL,
        scan_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        scan_location TEXT,
        scan_method TEXT DEFAULT 'qr',
        ip_address TEXT,
        user_agent TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sgtin_id) REFERENCES sgtins(id)
      )
    `, (err) => {
      if (err) console.error('[scan_events]', err);
      else console.log('✓ scan_events table');
    });

    // Phase 8: Authentication
    // Table: users (for demo/POC purposes)
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[users]', err);
      else console.log('✓ users table');
    });

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_gtins_style_id ON gtins(style_id)`, (err) => {
      if (err) console.error('[index gtins_style_id]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_gtins_variant_id ON gtins(variant_id)`, (err) => {
      if (err) console.error('[index gtins_variant_id]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_gtins_gtin ON gtins(gtin)`, (err) => {
      if (err) console.error('[index gtins_gtin]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_variants_style_id ON variants(style_id)`, (err) => {
      if (err) console.error('[index variants_style_id]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_sgtins_gtin_id ON sgtins(gtin_id)`, (err) => {
      if (err) console.error('[index sgtins_gtin_id]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_sgtins_batch_id ON sgtins(batch_id)`, (err) => {
      if (err) console.error('[index sgtins_batch_id]', err);
    });

    // Phase 1 (ROADMAP.md): Passport versioning + supersede lock
    // Table: passport_versions - tracks version history per SGTIN passport
    db.run(`
      CREATE TABLE IF NOT EXISTS passport_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        version_number INTEGER NOT NULL,
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        change_type TEXT,
        change_note TEXT,
        superseded_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (superseded_by) REFERENCES passport_versions(id)
      )
    `, (err) => {
      if (err) console.error('[passport_versions]', err);
      else console.log('✓ passport_versions table');
    });

    // Existing tables predate these columns - CREATE TABLE IF NOT EXISTS
    // is a no-op once the table already exists, so new columns need an
    // explicit ALTER TABLE (see CHANGELOG.md - this is the same class of
    // bug that broke data/dpp-v2.db.stale-backup). "duplicate column"
    // errors on repeat runs are expected and silently ignored.
    //
    // NOTE: dpp_values has UNIQUE(field_definition_id, entity_type,
    // entity_id) - a supersede-chain of multiple rows per field+entity
    // (as originally planned in ROADMAP.md) is not possible without
    // rebuilding that constraint. Correcting the plan instead: history
    // for a locked value is kept in field_change_log (already records
    // old_value/new_value/timestamp via audit-service.js), and
    // dpp_values.locked_at just marks that the CURRENT row was written
    // while its batch was already produced.
    db.run(`ALTER TABLE batches ADD COLUMN produced_at DATETIME`, () => {});
    db.run(`ALTER TABLE dpp_values ADD COLUMN locked_at DATETIME`, () => {});

    // Variant-level architecture fix (ROADMAP.md): variants previously
    // carried only a code/label (variant_name) - for product types like
    // tops, the product name (and image) genuinely differs per variant,
    // not just per style, so variants need their own content fields.
    // NULL falls back to the style's product_name/image_url.
    db.run(`ALTER TABLE variants ADD COLUMN product_name TEXT`, () => {});
    db.run(`ALTER TABLE variants ADD COLUMN image_url TEXT`, () => {});

    // Variant joins Style/Batch/GTIN/SGTIN as a DPP value level, between
    // Batch and Style in resolution precedence (SGTIN > GTIN > Batch >
    // Variant > Style) - see passport-resolver.js.
    db.run(`ALTER TABLE field_definitions ADD COLUMN editable_at_variant BOOLEAN DEFAULT 1`, () => {});

    // Freeze-at-production design (2026-09-19): not every field should
    // lock when a batch is marked produced - EU-required fields must
    // (that's the whole point, proving the compliance data is fixed),
    // but Nudie-specific fields are the brand's own discretion and may
    // legitimately need continued editing after production. No SQLite
    // DEFAULT can vary by another column's value, so this is added
    // nullable and backfilled from `category` below (see
    // migrateLocksAtProduction) rather than given a single hardcoded
    // DEFAULT. Editable per field in Field Config, overriding the
    // category default in either direction.
    db.run(`ALTER TABLE field_definitions ADD COLUMN locks_at_production BOOLEAN`, () => {});

    // Supply chain (ROADMAP.md): a repeating list of named process steps
    // (Raw Material, Spinning, Weaving Mill, Thread Supplier, ...), each
    // with a supplier - not a single scalar value, so this doesn't fit
    // field_definitions/dpp_values. Modeled on the real structure
    // observed on nudiejeans.com's Transparency panel. entity_type is
    // 'style' for now (the level suppliers/processes are normally
    // defined at); could extend to other levels later the same way
    // dpp_values does, without a schema change.
    db.run(`
      CREATE TABLE IF NOT EXISTS supply_chain_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL DEFAULT 'style',
        entity_id INTEGER NOT NULL,
        step_category TEXT NOT NULL,
        step_label TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        supplier_name TEXT,
        city TEXT,
        country TEXT,
        employee_range TEXT,
        visited_by_brand BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[supply_chain_steps]', err);
      else console.log('✓ supply_chain_steps table');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_supply_chain_steps_entity ON supply_chain_steps(entity_type, entity_id)`, (err) => {
      if (err) console.error('[index supply_chain_steps_entity]', err);
    });

    // GS1 hierarchy design (2026-09-17/19): which levels make up a
    // product's identifier/QR code is configurable per product type,
    // not hardcoded to the full Style>Batch>GTIN>SGTIN chain:
    //   batch_gtin_sgtin - full hierarchy (today's only behavior)
    //   batch_gtin       - no individual units; one code per Batch+GTIN
    //   gtin_sgtin       - individual units, but Batch doesn't
    //                      participate in inheritance/identity
    // Global per product type only (confirmed - no per-Style/Batch
    // override). Kept separate from the legacy styles.product_type
    // TEXT column (still used by product-type-config.js's size-format
    // logic) - styles.product_type_id is the new FK driving GS1 scheme.
    db.run(`
      CREATE TABLE IF NOT EXISTS product_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        gs1_scheme TEXT NOT NULL DEFAULT 'batch_gtin_sgtin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[product_types]', err);
      else console.log('✓ product_types table');
    });

    db.run(`ALTER TABLE styles ADD COLUMN product_type_id INTEGER REFERENCES product_types(id)`, () => {});

    // ROADMAP.md Phase 4: ESPR requires the passport to name who is
    // legally responsible for the product (manufacturer, importer, or
    // authorized representative - name and address). Assigned at Style
    // level (the default) with an optional Batch-level override, same
    // nullable-FK-inherits-from-parent pattern as everywhere else in
    // this schema - a batch without its own operator_id falls back to
    // its style's.
    db.run(`
      CREATE TABLE IF NOT EXISTS economic_operators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        legal_name TEXT NOT NULL,
        address TEXT,
        country TEXT,
        registration_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[economic_operators]', err);
      else console.log('✓ economic_operators table');
    });

    db.run(`ALTER TABLE styles ADD COLUMN operator_id INTEGER REFERENCES economic_operators(id)`, () => {});
    db.run(`ALTER TABLE batches ADD COLUMN operator_id INTEGER REFERENCES economic_operators(id)`, () => {});

    // A Batch can span multiple Styles (and Style Variants) - see
    // CLAUDE.md's PO45001234 example. A plain Batch-level dpp_values
    // override applies to the WHOLE batch regardless of which Style a
    // GTIN belongs to, which doesn't work when different Styles in the
    // same batch need different values (e.g. two Styles produced in one
    // run needing different country_of_origin overrides). This table
    // gives dpp_values a narrower "entity" to point at: a specific
    // (batch, style) or (batch, style, variant) combination, via
    // entity_type='batch_style'. NULL variant_id = applies to the whole
    // Style within this batch, regardless of variant. SQLite treats
    // NULLs as distinct in UNIQUE indexes, so the UNIQUE constraint
    // below does NOT prevent duplicate (batch_id, style_id, NULL) rows -
    // repositories/batch-style-scopes.js's getOrCreate() enforces that
    // with an explicit SELECT-before-INSERT instead.
    db.run(`
      CREATE TABLE IF NOT EXISTS batch_style_scopes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL REFERENCES batches(id),
        style_id INTEGER NOT NULL REFERENCES styles(id),
        variant_id INTEGER REFERENCES variants(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(batch_id, style_id, variant_id)
      )
    `, (err) => {
      if (err) console.error('[batch_style_scopes]', err);
      else console.log('✓ batch_style_scopes table');
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_batch_style_scopes_batch ON batch_style_scopes(batch_id)`, (err) => {
      if (err) console.error('[index batch_style_scopes_batch]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_passport_versions_entity ON passport_versions(entity_type, entity_id)`, (err) => {
      if (err) console.error('[index passport_versions_entity]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_dpp_values_entity ON dpp_values(entity_type, entity_id)`, (err) => {
      if (err) console.error('[index dpp_values_entity]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_field_change_log_entity ON field_change_log(entity_type, entity_id)`, (err) => {
      if (err) console.error('[index field_change_log_entity]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_lifecycle_events_sgtin ON lifecycle_events(sgtin_id)`, (err) => {
      if (err) console.error('[index lifecycle_events_sgtin]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_scan_events_sgtin ON scan_events(sgtin_id)`, (err) => {
      if (err) console.error('[index scan_events_sgtin]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_scan_events_timestamp ON scan_events(scan_timestamp)`, (err) => {
      if (err) console.error('[index scan_events_timestamp]', err);
    });

    console.log('[DPP v2] Database initialization complete\n');
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const close = () => {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Phase 2 (ROADMAP.md): add dpp_values.locale for multi-language values.
// SQLite can't ALTER a UNIQUE constraint, so adding locale to
// UNIQUE(field_definition_id, entity_type, entity_id) means rebuilding
// the table: create the new shape, copy data (existing rows get
// locale = NULL, i.e. "default"), drop the old table, rename the new
// one in. Guarded by checking for the column first, so this only runs
// once even though init() runs on every server start.
const migrateDppValuesLocale = async () => {
  const columns = await all(`PRAGMA table_info(dpp_values)`);
  const hasLocale = columns.some(c => c.name === 'locale');
  if (hasLocale) return;

  console.log('[DPP v2] Migrating dpp_values to add locale support...');

  await run(`
    CREATE TABLE dpp_values_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_definition_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      value TEXT,
      locale TEXT,
      source_system TEXT DEFAULT 'manual',
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      locked_at DATETIME,
      FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id),
      UNIQUE(field_definition_id, entity_type, entity_id, locale)
    )
  `);

  await run(`
    INSERT INTO dpp_values_new
      (id, field_definition_id, entity_type, entity_id, value, locale,
       source_system, created_by, created_at, updated_at, locked_at)
    SELECT
      id, field_definition_id, entity_type, entity_id, value, NULL,
      source_system, created_by, created_at, updated_at, locked_at
    FROM dpp_values
  `);

  await run(`DROP TABLE dpp_values`);
  await run(`ALTER TABLE dpp_values_new RENAME TO dpp_values`);
  await run(`CREATE INDEX IF NOT EXISTS idx_dpp_values_entity ON dpp_values(entity_type, entity_id)`);

  console.log('[DPP v2] dpp_values locale migration complete');
};

// Freeze-at-production design (2026-09-19): backfill
// locks_at_production from category for any field that doesn't have
// it set yet - true for eu_required, false for everything else
// (nudie). Only touches NULL rows, so per-field overrides made later
// in Field Config are never clobbered by this running again.
const migrateLocksAtProduction = async () => {
  const result = await run(
    `UPDATE field_definitions
     SET locks_at_production = CASE WHEN category = 'eu_required' THEN 1 ELSE 0 END
     WHERE locks_at_production IS NULL`
  );
  if (result.changes > 0) {
    console.log(`[DPP v2] Backfilled locks_at_production for ${result.changes} field(s)`);
  }
};

// GS1 hierarchy design (2026-09-19): backfill product_types from
// whatever distinct styles.product_type text values already exist,
// defaulting each to the 'batch_gtin_sgtin' scheme (today's actual
// behavior for every existing style), then point styles.product_type_id
// at the matching row. Only touches styles that don't have a
// product_type_id yet, so it's safe to run on every server start.
const migrateProductTypes = async () => {
  const styles = await all(`SELECT id, product_type FROM styles WHERE product_type_id IS NULL AND product_type IS NOT NULL AND TRIM(product_type) != ''`);
  if (styles.length === 0) return;

  console.log('[DPP v2] Backfilling product_types from styles.product_type...');

  for (const style of styles) {
    const label = style.product_type.trim();
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    let productType = await get(`SELECT * FROM product_types WHERE key = ?`, [key]);
    if (!productType) {
      const result = await run(
        `INSERT INTO product_types (key, label, gs1_scheme) VALUES (?, ?, 'batch_gtin_sgtin')`,
        [key, label]
      );
      productType = { id: result.lastID };
    }

    await run(`UPDATE styles SET product_type_id = ? WHERE id = ?`, [productType.id, style.id]);
  }

  console.log('[DPP v2] product_types backfill complete');
};

// Bug found 2026-09-19: dpp_values.setDppValue() used to rely on
// `ON CONFLICT(field_definition_id, entity_type, entity_id, locale)
// DO UPDATE` - but SQLite treats every NULL `locale` as distinct from
// every other NULL for uniqueness purposes, so that ON CONFLICT never
// matched an existing default-locale row and silently inserted a
// duplicate on every edit past the first. Fixed in
// repositories/fields.js (explicit SELECT-then-UPDATE-or-INSERT, same
// pattern as batch-style-scopes.js's identical NULL-uniqueness quirk).
// This cleans up any duplicates the bug already created - for each
// (field_definition_id, entity_type, entity_id, locale) group with
// more than one row, keeps the most recently updated one and deletes
// the rest. Safe to run on every server start once no duplicates
// remain (no-op).
const migrateDeduplicateDppValues = async () => {
  const groups = await all(`
    SELECT field_definition_id, entity_type, entity_id, locale
    FROM dpp_values GROUP BY field_definition_id, entity_type, entity_id, locale HAVING COUNT(*) > 1
  `);
  if (groups.length === 0) return;

  console.log(`[DPP v2] Deduplicating ${groups.length} dpp_values group(s) affected by the ON CONFLICT/NULL bug...`);
  for (const g of groups) {
    const rows = await all(
      `SELECT id FROM dpp_values WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ? AND locale IS ? ORDER BY updated_at DESC`,
      [g.field_definition_id, g.entity_type, g.entity_id, g.locale]
    );
    for (const row of rows.slice(1)) {
      await run(`DELETE FROM dpp_values WHERE id = ?`, [row.id]);
    }
  }
  console.log('[DPP v2] dpp_values deduplication complete');
};

// Found 2026-09-20 during the hardcoded-columns audit: gtins.gtin
// already IS the GTIN/EAN barcode (CLAUDE.md treats them as the same
// identifier, and every real gtins.gtin value confirms it - e.g.
// "5711814090000"). The separate gtins.ean column was meant for a case
// where a product's published EAN differs from its internal GTIN, but
// it's never been populated (always NULL) and never read back anywhere
// - user confirmed there should only be one field for this. Guarded by
// checking for the column first, so this only runs once.
const migrateDropGtinEan = async () => {
  const columns = await all(`PRAGMA table_info(gtins)`);
  const hasEan = columns.some(c => c.name === 'ean');
  if (!hasEan) return;

  console.log('[DPP v2] Dropping unused gtins.ean column (gtin is the single EAN field)...');
  await run(`ALTER TABLE gtins DROP COLUMN ean`);
  console.log('[DPP v2] gtins.ean drop complete');
};

// Found 2026-09-20 alongside gtins.ean: gtins.weight is only ever
// written by the CSV import (import-service.js) and never read back -
// no admin view displays it. User confirmed it should go too. Guarded
// the same way, so this only runs once.
const migrateDropGtinWeight = async () => {
  const columns = await all(`PRAGMA table_info(gtins)`);
  const hasWeight = columns.some(c => c.name === 'weight');
  if (!hasWeight) return;

  console.log('[DPP v2] Dropping unused gtins.weight column...');
  await run(`ALTER TABLE gtins DROP COLUMN weight`);
  console.log('[DPP v2] gtins.weight drop complete');
};

// Hardcoded-columns audit (2026-09-20): batches.supplier/factory and
// gtins.color are consumer-facing content rendered with no override/
// audit/lock support - same gap country_of_origin used to have. Per
// explicit decision: supplier/factory -> eu_required (traceability,
// same category as country_of_origin), color -> nudie (plain product
// description, not an EU-mandated fact). Creates the three
// field_definitions rows if missing, then backfills dpp_values from
// the existing raw columns so no data visibly disappears when the
// display code switches to reading the resolved field instead. Guarded
// by checking for the field_key first, so this only runs once - a
// later edit to these fields via Field Config is never overwritten.
const migrateSupplierFactoryColorFields = async () => {
  const fieldsToCreate = [
    { key: 'supplier', label: 'Supplier', category: 'eu_required', levels: ['style', 'variant', 'batch', 'gtin', 'sgtin'] },
    { key: 'factory', label: 'Factory', category: 'eu_required', levels: ['style', 'variant', 'batch', 'gtin', 'sgtin'] },
    { key: 'color', label: 'Color', category: 'nudie', levels: ['style', 'variant', 'gtin', 'sgtin'] }
  ];

  for (const f of fieldsToCreate) {
    const existing = await get(`SELECT id FROM field_definitions WHERE field_key = ?`, [f.key]);
    if (existing) continue;

    console.log(`[DPP v2] Creating '${f.key}' field definition and backfilling existing data...`);
    const locksAtProduction = f.category === 'eu_required' ? 1 : 0;
    const result = await run(
      `INSERT INTO field_definitions
       (field_key, label, description, data_type, category, required, consumer_visible,
        editable_at_style, editable_at_variant, editable_at_batch, editable_at_gtin, editable_at_sgtin,
        locks_at_production, sort_order)
       VALUES (?, ?, '', 'text', ?, 0, 1, ?, ?, ?, ?, ?, ?, 0)`,
      [
        f.key, f.label, f.category,
        f.levels.includes('style') ? 1 : 0,
        f.levels.includes('variant') ? 1 : 0,
        f.levels.includes('batch') ? 1 : 0,
        f.levels.includes('gtin') ? 1 : 0,
        f.levels.includes('sgtin') ? 1 : 0,
        locksAtProduction
      ]
    );
    const fieldDefinitionId = result.lastID;

    if (f.key === 'color') {
      const gtinsWithColor = await all(`SELECT id, color FROM gtins WHERE color IS NOT NULL AND TRIM(color) != ''`);
      for (const g of gtinsWithColor) {
        await run(
          `INSERT INTO dpp_values (field_definition_id, entity_type, entity_id, value, source_system) VALUES (?, 'gtin', ?, ?, 'manual')`,
          [fieldDefinitionId, g.id, g.color]
        );
      }
      console.log(`[DPP v2] Backfilled 'color' for ${gtinsWithColor.length} GTIN(s)`);
    } else {
      const batchesWithValue = await all(`SELECT id, ${f.key} as val FROM batches WHERE ${f.key} IS NOT NULL AND TRIM(${f.key}) != ''`);
      for (const b of batchesWithValue) {
        await run(
          `INSERT INTO dpp_values (field_definition_id, entity_type, entity_id, value, source_system) VALUES (?, 'batch', ?, ?, 'manual')`,
          [fieldDefinitionId, b.id, b.val]
        );
      }
      console.log(`[DPP v2] Backfilled '${f.key}' for ${batchesWithValue.length} batch(es)`);
    }
  }
};

// Initialize on module load
init();
migrateDppValuesLocale().catch(err => console.error('[dpp_values locale migration]', err));
migrateProductTypes().catch(err => console.error('[product_types migration]', err));
migrateLocksAtProduction().catch(err => console.error('[locks_at_production migration]', err));
migrateDeduplicateDppValues().catch(err => console.error('[dpp_values deduplication]', err));
migrateDropGtinEan().catch(err => console.error('[gtins.ean drop migration]', err));
migrateDropGtinWeight().catch(err => console.error('[gtins.weight drop migration]', err));
migrateSupplierFactoryColorFields().catch(err => console.error('[supplier/factory/color field migration]', err));

// Extended authority/recycler view (ROADMAP.md, "Platform vision"):
// a second visibility flag alongside consumer_visible, additive so
// existing consumer_visible enforcement is never touched. Defaults to
// true (matching consumer_visible's own default) so existing fields
// are visible to an authenticated authority/recycler unless explicitly
// hidden - the restrictive case (hide from consumers, still show to
// authority) is the interesting one, not the reverse.
const migrateAuthorityVisible = async () => {
  const columns = await all(`PRAGMA table_info(field_definitions)`);
  const hasAuthorityVisible = columns.some(c => c.name === 'authority_visible');
  if (hasAuthorityVisible) return;

  console.log('[DPP v2] Adding field_definitions.authority_visible...');
  await run(`ALTER TABLE field_definitions ADD COLUMN authority_visible BOOLEAN DEFAULT 1`);
  console.log('[DPP v2] authority_visible column added');
};
migrateAuthorityVisible().catch(err => console.error('[authority_visible migration]', err));

module.exports = {
  db,
  run,
  get,
  all,
  close
};
