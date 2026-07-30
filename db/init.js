const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database error:', err);
  else console.log('✓ Database connected');
});

// Create tables
db.serialize(() => {
  // Styles table (style-level metadata)
  db.run(`
    CREATE TABLE IF NOT EXISTS styles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      style_number TEXT UNIQUE NOT NULL,
      product_name TEXT,
      description TEXT,
      care_instructions TEXT,
      delivery_returns TEXT,
      size_material_composition TEXT,
      images TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Style images (separate table for easier management)
  db.run(`
    CREATE TABLE IF NOT EXISTS style_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      style_number TEXT NOT NULL,
      image_data LONGTEXT,
      image_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(style_number) REFERENCES styles(style_number)
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

  // Transparency data (DPP - per style)
  db.run(`
    CREATE TABLE IF NOT EXISTS transparency_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      style_number TEXT UNIQUE NOT NULL,
      suppliers_chain TEXT,
      certifications TEXT,
      environmental_data TEXT,
      social_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(style_number) REFERENCES styles(style_number)
    )
  `);

  // Nudie values (repair, trade-in, etc - per style)
  db.run(`
    CREATE TABLE IF NOT EXISTS nudie_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      style_number TEXT UNIQUE NOT NULL,
      repair_info TEXT,
      trade_in_info TEXT,
      partner_links TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(style_number) REFERENCES styles(style_number)
    )
  `);

  // Storytelling (per style)
  db.run(`
    CREATE TABLE IF NOT EXISTS storytelling (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      style_number TEXT UNIQUE NOT NULL,
      summary TEXT,
      content TEXT,
      links TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(style_number) REFERENCES styles(style_number)
    )
  `);

  // Batches table
  db.run(`
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT UNIQUE NOT NULL,
      style_number TEXT NOT NULL,
      total_units INTEGER,
      partner_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(style_number) REFERENCES styles(style_number)
    )
  `);

  // Serials table
  db.run(`
    CREATE TABLE IF NOT EXISTS serials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      serial_number TEXT UNIQUE NOT NULL,
      gtin TEXT,
      sgtin_numeric TEXT,
      sgtin_uri TEXT,
      rfid TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(batch_id) REFERENCES batches(batch_id)
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
});

// Seed test data
const seedTestData = () => {
  db.serialize(() => {
    // Insert test style
    db.run(`
      INSERT OR IGNORE INTO styles (style_number, product_name, description, care_instructions, delivery_returns, size_material_composition)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      '114519',
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
      INSERT OR IGNORE INTO batches (batch_id, style_number, total_units, partner_name)
      VALUES (?, ?, ?, ?)
    `, ['114519-BATCH001', '114519', 100, 'Trimco Manufacturing']);

    // Insert test serials with SGTIN data
    const testSerials = [
      { serial: '114519-001-AA', sgtin_num: '3014141701120001', sgtin_uri: 'https://id.gs1.org/01/05707141145391/21/001AA', rfid: '12AB34CD56EF00' },
      { serial: '114519-001-AB', sgtin_num: '3014141701120002', sgtin_uri: 'https://id.gs1.org/01/05707141145391/21/001AB', rfid: '12AB34CD56EF01' },
      { serial: '114519-001-AC', sgtin_num: '3014141701120003', sgtin_uri: 'https://id.gs1.org/01/05707141145391/21/001AC', rfid: '12AB34CD56EF02' }
    ];

    testSerials.forEach(s => {
      db.run(`
        INSERT OR IGNORE INTO serials (batch_id, serial_number, sgtin_numeric, sgtin_uri, rfid)
        VALUES (?, ?, ?, ?, ?)
      `, ['114519-BATCH001', s.serial, s.sgtin_num, s.sgtin_uri, s.rfid], function() {
        const serialId = this.lastID;

        // Add serial data (size, condition, location)
        db.run(`INSERT OR IGNORE INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
          [serialId, 'size', 'M', 'system']);
        db.run(`INSERT OR IGNORE INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
          [serialId, 'condition', 'new', 'system']);
        db.run(`INSERT OR IGNORE INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
          [serialId, 'location', 'warehouse-stockholm', 'system']);

        // Add test event for first serial
        if (s.serial === '114519-001-AA') {
          db.run(`INSERT OR IGNORE INTO events (serial_id, event_type, event_data) VALUES (?, ?, ?)`,
            [serialId, 'scanned', JSON.stringify({ location: 'Stockholm Store', timestamp: new Date().toISOString() })]);
        }
      });
    });
  });
};

// Run seed on startup
seedTestData();

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
      SELECT s.*, b.style_number, b.batch_id as batch_name
      FROM serials s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
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
