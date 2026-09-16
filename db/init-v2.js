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
        ean TEXT,
        size TEXT,
        color TEXT,
        variant TEXT,
        weight REAL,
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

// Initialize on module load
init();
migrateDppValuesLocale().catch(err => console.error('[dpp_values locale migration]', err));

module.exports = {
  db,
  run,
  get,
  all,
  close
};
