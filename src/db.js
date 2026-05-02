const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/dpp.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeTables();
  }
});

function initializeTables() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS styles (
        style_id INTEGER PRIMARY KEY AUTOINCREMENT,
        style_number TEXT UNIQUE NOT NULL,
        style_name TEXT NOT NULL,
        product_type TEXT NOT NULL,
        material_composition TEXT,
        supplier TEXT,
        country_of_origin TEXT,
        care_instructions TEXT,
        certification_name TEXT,
        certification_url TEXT,
        image_url TEXT,
        has_variants INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS variants (
        variant_id INTEGER PRIMARY KEY AUTOINCREMENT,
        style_id INTEGER NOT NULL,
        variant_code TEXT NOT NULL,
        variant_name TEXT,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (style_id, variant_code),
        FOREIGN KEY (style_id) REFERENCES styles(style_id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS batches (
        batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
        style_id INTEGER NOT NULL,
        variant_id INTEGER,
        batch_number TEXT UNIQUE NOT NULL,
        production_date DATE,
        quantity INTEGER,
        material_composition TEXT,
        supplier TEXT,
        recycling_info TEXT,
        passport_url TEXT,
        status TEXT DEFAULT 'active',
        lifecycle_status TEXT DEFAULT 'draft',
        archived INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (style_id) REFERENCES styles(style_id),
        FOREIGN KEY (variant_id) REFERENCES variants(variant_id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS change_log (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL,
        change_type TEXT NOT NULL,
        change_description TEXT,
        changed_field TEXT,
        old_value TEXT,
        new_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
      )
    `);
  });
}

module.exports = db;
