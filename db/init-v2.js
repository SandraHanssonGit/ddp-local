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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[styles]', err);
      else console.log('✓ styles table');
    });

    // Table: batches
    db.run(`
      CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        style_id INTEGER NOT NULL,
        batch_id TEXT NOT NULL,
        production_order TEXT,
        production_date DATE,
        supplier TEXT,
        factory TEXT,
        country_of_production TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (style_id) REFERENCES styles(id),
        UNIQUE(style_id, batch_id)
      )
    `, (err) => {
      if (err) console.error('[batches]', err);
      else console.log('✓ batches table');
    });

    // Table: gtins
    db.run(`
      CREATE TABLE IF NOT EXISTS gtins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL,
        gtin TEXT NOT NULL UNIQUE,
        ean TEXT,
        size TEXT,
        color TEXT,
        variant TEXT,
        weight REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES batches(id)
      )
    `, (err) => {
      if (err) console.error('[gtins]', err);
      else console.log('✓ gtins table');
    });

    // Table: sgtins
    db.run(`
      CREATE TABLE IF NOT EXISTS sgtins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gtin_id INTEGER NOT NULL,
        serial_number TEXT NOT NULL,
        sgtin TEXT UNIQUE,
        rfid_id TEXT,
        qc_status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gtin_id) REFERENCES gtins(id),
        UNIQUE(gtin_id, serial_number)
      )
    `, (err) => {
      if (err) console.error('[sgtins]', err);
      else console.log('✓ sgtins table');
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

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_batches_style_id ON batches(style_id)`, (err) => {
      if (err) console.error('[index batches_style_id]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_gtins_batch_id ON gtins(batch_id)`, (err) => {
      if (err) console.error('[index gtins_batch_id]', err);
    });

    db.run(`CREATE INDEX IF NOT EXISTS idx_sgtins_gtin_id ON sgtins(gtin_id)`, (err) => {
      if (err) console.error('[index sgtins_gtin_id]', err);
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

// Initialize on module load
init();

module.exports = {
  db,
  run,
  get,
  all,
  close
};
