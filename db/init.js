const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database error:', err);
  else console.log('✓ Database connected');
});

// Configure SQLite for better concurrency
db.configure('busyTimeout', 5000); // Wait up to 5 seconds if database is locked
db.run('PRAGMA journal_mode = WAL'); // Use Write-Ahead Logging mode for better concurrency

// Create tables
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'viewer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Styles table (style-level metadata)
  // For jeans: style_number only, variant = NULL
  // For topps: style_number + variant (e.g., 140929-B20)
  db.run(`
    CREATE TABLE IF NOT EXISTS styles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      style_number TEXT NOT NULL,
      variant TEXT,
      product_type TEXT DEFAULT 'jeans',
      product_name TEXT,
      description TEXT,
      care_instructions TEXT,
      delivery_returns TEXT,
      size_material_composition TEXT,
      images TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(style_number, variant)
    )
  `);

  // Ensure UNIQUE constraint exists (for existing databases)
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_styles_unique ON styles(style_number, variant)`);

  // Style images (separate table for easier management)
  // Supports variant for topps (e.g., style_number='101011', variant='B25')
  db.run(`
    CREATE TABLE IF NOT EXISTS style_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      style_number TEXT NOT NULL,
      variant TEXT,
      image_data LONGTEXT,
      image_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(style_number, variant)
    )
  `);

  // Batch images
  db.run(`
    CREATE TABLE IF NOT EXISTS batch_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      image_data LONGTEXT,
      image_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(batch_id) REFERENCES batches(batch_id)
    )
  `);

  // Transparency data (DPP - per style+variant)
  db.run(`
    CREATE TABLE IF NOT EXISTS transparency_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      style_number TEXT NOT NULL,
      variant TEXT,
      suppliers_chain TEXT,
      certifications TEXT,
      environmental_data TEXT,
      social_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(style_number) REFERENCES styles(style_number),
      UNIQUE(style_number, variant)
    )
  `);

  // Nudie values (repair, trade-in, etc - per style+variant)
  db.run(`
    CREATE TABLE IF NOT EXISTS nudie_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      style_number TEXT NOT NULL,
      variant TEXT,
      repair_info TEXT,
      trade_in_info TEXT,
      partner_links TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(style_number) REFERENCES styles(style_number),
      UNIQUE(style_number, variant)
    )
  `);

  // Storytelling (per style+variant)
  db.run(`
    CREATE TABLE IF NOT EXISTS storytelling (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      style_number TEXT NOT NULL,
      variant TEXT,
      summary TEXT,
      content TEXT,
      links TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(style_number) REFERENCES styles(style_number),
      UNIQUE(style_number, variant)
    )
  `);

  // Batches table (can contain serials from multiple styles)
  db.run(`
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT UNIQUE NOT NULL,
      po TEXT,
      total_units INTEGER,
      partner_name TEXT,
      production_date DATE,
      manufacturing_details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Serials table (belongs to both a batch AND a style)
  db.run(`
    CREATE TABLE IF NOT EXISTS serials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      style_number TEXT NOT NULL,
      variant TEXT,
      serial_number TEXT UNIQUE NOT NULL,
      gtin TEXT,
      sgtin_numeric TEXT,
      sgtin_uri TEXT,
      rfid TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY(batch_id) REFERENCES batches(batch_id) ON DELETE CASCADE,
      FOREIGN KEY(style_number) REFERENCES styles(style_number)
    )
  `);

  // Serial data (key-value flexible)
  db.run(`
    CREATE TABLE IF NOT EXISTS serial_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      added_by TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(serial_id) REFERENCES serials(id)
    )
  `);

  // Batch data (key-value flexible)
  db.run(`
    CREATE TABLE IF NOT EXISTS batch_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(batch_id) REFERENCES batches(batch_id)
    )
  `);

  // Batch style data (composition, etc. per style per batch)
  db.run(`
    CREATE TABLE IF NOT EXISTS batch_style_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      style_number TEXT NOT NULL,
      variant TEXT,
      composition TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(batch_id, style_number, variant),
      FOREIGN KEY(batch_id) REFERENCES batches(batch_id)
    )
  `);

  // Events (repair, recycling, etc)
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(serial_id) REFERENCES serials(id)
    )
  `);

  // Page views (statistics)
  db.run(`
    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_type TEXT NOT NULL,
      page_id TEXT NOT NULL,
      username TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings (for logo and other system settings)
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Add deleted_at column for soft deletes (if not exists)
db.serialize(() => {
  db.run(`ALTER TABLE styles ADD COLUMN deleted_at DATETIME`, () => {});
  db.run(`ALTER TABLE batches ADD COLUMN deleted_at DATETIME`, () => {});
  db.run(`ALTER TABLE serials ADD COLUMN deleted_at DATETIME`, () => {});
  db.run(`ALTER TABLE serials ADD COLUMN view_count INTEGER DEFAULT 0`, () => {});
});

// Add database indexes for performance
db.serialize(() => {
  // Primary lookup indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_styles_style_number ON styles(style_number)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_batches_batch_id ON batches(batch_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_serials_serial_number ON serials(serial_number)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_serials_batch_id ON serials(batch_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_serials_style_number ON serials(style_number)`);

  // Foreign key and data lookup indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_serial_data_serial_id ON serial_data(serial_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_batch_data_batch_id ON batch_data(batch_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_events_serial_id ON events(serial_id)`);

  // SGTIN/RFID lookup indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_serials_sgtin_numeric ON serials(sgtin_numeric)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_serials_sgtin_uri ON serials(sgtin_uri)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_serials_rfid ON serials(rfid)`);

  // Image lookup indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_style_images_style_number ON style_images(style_number)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_batch_images_batch_id ON batch_images(batch_id)`);

  // Page views indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_page_views_page_type ON page_views(page_type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_page_views_page_id ON page_views(page_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at)`);

  // Clean up orphaned serials (serials pointing to non-existent batches)
  db.run(`
    DELETE FROM serials
    WHERE batch_id NOT IN (SELECT batch_id FROM batches)
  `, (err) => {
    if (!err) console.log('✓ Cleaned up orphaned serials');
  });

  // Clean up orphaned events (events pointing to non-existent serials)
  db.run(`
    DELETE FROM events
    WHERE serial_id NOT IN (SELECT id FROM serials)
  `, (err) => {
    if (!err) console.log('✓ Cleaned up orphaned events');
  });

  // Clean up orphaned serial_data (serial_data pointing to non-existent serials)
  db.run(`
    DELETE FROM serial_data
    WHERE serial_id NOT IN (SELECT id FROM serials)
  `, (err) => {
    if (!err) console.log('✓ Cleaned up orphaned serial_data');
  });
});

// Seed test data
const seedTestData = async () => {
  // Hash test passwords
  const hashedPassword1 = await bcrypt.hash('password123', 10);
  const hashedPassword2 = await bcrypt.hash('test', 10);

  db.serialize(() => {
    // Insert test users (passwords are securely hashed with bcrypt)
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
      ['sandra', hashedPassword1, 'super_admin']);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
      ['viewer', hashedPassword2, 'viewer']);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
      ['editor', hashedPassword2, 'editor']);
    db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
      ['admin', hashedPassword2, 'admin']);

    // Insert test style (Jeans - no variant)
    db.run(`
      INSERT OR IGNORE INTO styles (style_number, variant, product_type, product_name, description, care_instructions, delivery_returns, size_material_composition)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      '114519',
      null,
      'jeans',
      'Lofty Lo',
      'A comfortable and durable low-rise jean with classic styling.',
      'Wash at 40°C with similar colors. Avoid bleach.',
      'Free shipping on orders over 500 SEK. 30-day returns.',
      '95% Organic Cotton, 5% Elastane'
    ]);

    // Insert test transparency data
    db.run(`
      INSERT OR IGNORE INTO transparency_data (style_number, suppliers_chain, certifications, environmental_data, social_data)
      VALUES (?, ?, ?, ?, ?)
    `, [
      '114519',
      JSON.stringify({
        spinning: 'Factory A - Pakistan',
        weaving: 'Factory B - India',
        dyeing: 'Factory C - Bangladesh',
        finishing: 'Factory D - Vietnam'
      }),
      JSON.stringify({
        GOTS: true,
        OCS: true,
        Fairwear: 'Audit 2024'
      }),
      JSON.stringify({
        PEF: '2.5 kg CO2e',
        renewable_energy: '80%',
        water_usage: '150L per garment'
      }),
      JSON.stringify({
        living_wages: true,
        audit_score: '85/100',
        audit_date: '2024-01-15'
      })
    ]);

    // Insert test nudie values
    db.run(`
      INSERT OR IGNORE INTO nudie_values (style_number, repair_info, trade_in_info, partner_links)
      VALUES (?, ?, ?, ?)
    `, [
      '114519',
      'Free repairs for 2 years on manufacturing defects. We cover broken zippers, seams, and buttons.',
      'Trade in your old jeans for 20% off a new pair.',
      JSON.stringify([
        { name: 'Stockholm Repair Hub', url: 'https://nudiejeans.com/repair/stockholm' },
        { name: 'Gothenburg Store', url: 'https://nudiejeans.com/stores/gothenburg' }
      ])
    ]);

    // Insert test storytelling
    db.run(`
      INSERT OR IGNORE INTO storytelling (style_number, summary, content, links)
      VALUES (?, ?, ?, ?)
    `, [
      '114519',
      'Our classic Lofty Lo is made from certified organic cotton with sustainable manufacturing practices across our entire supply chain.',
      'The Lofty Lo is a timeless classic that has been part of Nudie Jeans since 2010. Every pair is carefully crafted using organic cotton and sustainable practices. We work with our partners to ensure fair wages and safe working conditions throughout the production chain.',
      JSON.stringify([
        { title: 'Read our sustainability report', url: 'https://nudiejeans.com/sustainability' },
        { title: 'Meet our suppliers', url: 'https://nudiejeans.com/suppliers' }
      ])
    ]);

    // Insert test batch
    db.run(`
      INSERT OR IGNORE INTO batches (batch_id, total_units, partner_name)
      VALUES (?, ?, ?)
    `, ['BATCH001', 100, 'Trimco Manufacturing']);

    // Insert test serials with SGTIN data
    const testSerials = [
      { serial: '001AA', style: '114519', sgtin_num: '3014141701120001', sgtin_uri: 'https://nudiejeans.dpp.com/01/05707141145391/21/001AA', rfid: '12AB34CD56EF00' },
      { serial: '001AB', style: '114519', sgtin_num: '3014141701120002', sgtin_uri: 'https://nudiejeans.dpp.com/01/05707141145391/21/001AB', rfid: '12AB34CD56EF01' },
      { serial: '001AC', style: '114519', sgtin_num: '3014141701120003', sgtin_uri: 'https://nudiejeans.dpp.com/01/05707141145391/21/001AC', rfid: '12AB34CD56EF02' }
    ];

    testSerials.forEach(s => {
      db.run(`
        INSERT OR IGNORE INTO serials (batch_id, style_number, serial_number, sgtin_numeric, sgtin_uri, rfid)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['BATCH001', s.style, s.serial, s.sgtin_num, s.sgtin_uri, s.rfid], function() {
        const serialId = this.lastID;

        // Add serial data (size, condition, location)
        db.run(`INSERT OR IGNORE INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
          [serialId, 'size', 'M', 'system']);
        db.run(`INSERT OR IGNORE INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
          [serialId, 'condition', 'new', 'system']);
        db.run(`INSERT OR IGNORE INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
          [serialId, 'location', 'warehouse-stockholm', 'system']);

        // Add test event for first serial
        if (s.serial === '001AA') {
          db.run(`INSERT OR IGNORE INTO events (serial_id, event_type, event_data) VALUES (?, ?, ?)`,
            [serialId, 'scanned', JSON.stringify({ location: 'Stockholm Store', timestamp: new Date().toISOString() })]);
        }
      });
    });
  });
};

// Run seed on startup ONLY if database is empty (no styles exist)
db.get('SELECT COUNT(*) as count FROM styles', (err, result) => {
  if (err) console.error('Seed check error:', err);
  else if (!result || result.count === 0) {
    seedTestData().catch(err => console.error('Seed error:', err));
  }
});

// Helper functions
const queries = {
  getBatch: (batch_id, callback) => {
    db.all(`
      SELECT b.*, 
             (SELECT COUNT(*) FROM serials WHERE batch_id = b.batch_id) as serial_count
      FROM batches b
      WHERE b.batch_id = ?
    `, [batch_id], callback);
  },

  getSerial: (serial_number, callback) => {
    db.all(`
      SELECT s.*
      FROM serials s
      WHERE s.serial_number = ?
    `, [serial_number], callback);
  },

  getSerialData: (serial_id, callback) => {
    db.all(`
      SELECT key, value, added_by, added_at
      FROM serial_data
      WHERE serial_id = ?
      ORDER BY added_at DESC
    `, [serial_id], callback);
  },

  getBatchData: (batch_id, callback) => {
    db.all(`
      SELECT key, value
      FROM batch_data
      WHERE batch_id = ?
    `, [batch_id], callback);
  },

  getEvents: (serial_id, callback) => {
    db.all(`
      SELECT event_type, event_data, created_at
      FROM events
      WHERE serial_id = ?
      ORDER BY created_at DESC
    `, [serial_id], callback);
  },

  addSerialData: (serial_id, key, value, added_by, callback) => {
    db.run(`
      INSERT INTO serial_data (serial_id, key, value, added_by)
      VALUES (?, ?, ?, ?)
    `, [serial_id, key, value, added_by], callback);
  },

  addEvent: (serial_id, event_type, event_data, callback) => {
    db.run(`
      INSERT INTO events (serial_id, event_type, event_data)
      VALUES (?, ?, ?)
    `, [serial_id, event_type, JSON.stringify(event_data)], callback);
  }
};

module.exports = { db, queries };
