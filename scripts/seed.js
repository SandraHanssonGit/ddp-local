const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/dpp.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Drop old tables if they exist
  db.run('DROP TABLE IF EXISTS change_log', (err) => {});
  db.run('DROP TABLE IF EXISTS batches', (err) => {});
  db.run('DROP TABLE IF EXISTS variants', (err) => {});
  db.run('DROP TABLE IF EXISTS styles', (err) => {});
  db.run('DROP TABLE IF EXISTS style_variants', (err) => {});
  db.run('DROP TABLE IF EXISTS items', (err) => {});
  db.run('DROP TABLE IF EXISTS manufacturing_orders', (err) => {});
  db.run('DROP TABLE IF EXISTS batch_product_data', (err) => {});

  // Create tables
  db.run(`CREATE TABLE styles (
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
    gtin TEXT,
    has_variants INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE variants (
    variant_id INTEGER PRIMARY KEY AUTOINCREMENT,
    style_id INTEGER NOT NULL,
    variant_code TEXT NOT NULL,
    variant_name TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (style_id, variant_code),
    FOREIGN KEY (style_id) REFERENCES styles(style_id)
  )`);

  db.run(`CREATE TABLE batches (
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
  )`);

  db.run(`CREATE TABLE change_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    change_description TEXT,
    changed_field TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
  )`);

  // Clear existing data
  db.run('DELETE FROM batches');
  db.run('DELETE FROM styles');

  // Insert test styles
  db.run(`INSERT INTO styles (style_number, style_name, product_type, material_composition, supplier, country_of_origin, care_instructions, certification_name, certification_url, image_url, gtin, has_variants)
    VALUES ('114539', 'Rad Rufus Indigo Blues', 'Men''s regular fit straight leg jeans', '100% Organic Cotton, 14.9 oz rigid denim', 'Premium Suppliers Inc', 'Tunisia', 'Wash cold, line dry', 'GOTS', 'https://www.gots.org', 'https://nudie.centracdn.net/client/dynamic/images/8147_aacababdb7-rad-rufus-indigo-blues-114539-01-flatshot-2400.jpg', '7323270111453', 0)`);

  db.run(`INSERT INTO styles (style_number, style_name, product_type, material_composition, supplier, country_of_origin, care_instructions, certification_name, certification_url, image_url, gtin, has_variants)
    VALUES ('131888', 'Roy Heavy Slub T-Shirt', 'Men''s T-Shirt', '100% Organic Cotton, heavy slub', 'Green Textiles Ltd', 'India', 'Gentle wash, tumble dry low', 'OEKO-TEX', 'https://www.oeko-tex.com', 'https://nudie.centracdn.net/client/dynamic/images/8497_8669602725-131888b30_roy_heavy_slub_t_shirt_antracite-flatshot-2400.jpg', '7323270131888', 1)`);

  db.run(`INSERT INTO styles (style_number, style_name, product_type, material_composition, supplier, country_of_origin, care_instructions, image_url, gtin, has_variants)
    VALUES ('120456', 'Summer Linen Shirt', 'Short sleeve shirt', '100% Linen', 'Linen Collective', 'Lithuania', 'Hand wash recommended', 'https://nudie.centracdn.net/client/dynamic/images/9234_2d3e1f4c5a-summer-linen-shirt-120456-01-flatshot-2400.jpg', '7323270120456', 0)`);

  // Insert test variants (for style 2 which has_variants=1)
  db.run(`INSERT INTO variants (style_id, variant_code, variant_name, image_url)
    VALUES (2, 'ANT', 'Antracite', 'https://nudie.centracdn.net/client/dynamic/images/8497_8669602725-131888b30_roy_heavy_slub_t_shirt_antracite-flatshot-2400.jpg')`);

  db.run(`INSERT INTO variants (style_id, variant_code, variant_name, image_url)
    VALUES (2, 'ECR', 'Ecru', 'https://nudie.centracdn.net/client/dynamic/images/8497_8669602725-131888b30_roy_heavy_slub_t_shirt_ecru-flatshot-2400.jpg')`);

  // Insert test batches
  // Batches for style 1 (no variants)
  db.run(`INSERT INTO batches (style_id, variant_id, batch_number, production_date, quantity, material_composition, supplier, recycling_info, passport_url, status, lifecycle_status, archived)
    VALUES (1, NULL, '1015893', '2024-01-15', 500, '100% Organic Cotton, 14.9 oz rigid denim', 'Premium Suppliers Inc', 'Organic cotton is fully recyclable and biodegradable', '/p/1015893', 'active', 'published', 0)`);

  db.run(`INSERT INTO batches (style_id, variant_id, batch_number, production_date, quantity, material_composition, supplier, recycling_info, passport_url, status, lifecycle_status, archived)
    VALUES (1, NULL, '1015894', '2024-02-01', 300, '100% Organic Cotton, 14.9 oz rigid denim', 'Premium Suppliers Inc', 'Organic cotton is fully recyclable and biodegradable', '/p/1015894', 'active', 'draft', 0)`);

  // Batches for style 2 variants
  db.run(`INSERT INTO batches (style_id, variant_id, batch_number, production_date, quantity, material_composition, supplier, recycling_info, passport_url, status, lifecycle_status, archived)
    VALUES (2, 1, '2024-ROY-001', '2024-02-01', 800, '100% Organic Cotton, heavy slub', 'Green Textiles Ltd', 'Recyclable cotton. Remove trims for proper recycling', '/p/2024-ROY-001', 'active', 'published', 0)`);

  db.run(`INSERT INTO batches (style_id, variant_id, batch_number, production_date, quantity, material_composition, supplier, recycling_info, passport_url, status, lifecycle_status, archived)
    VALUES (2, 2, '2024-ROY-002', '2024-02-15', 600, '100% Organic Cotton, heavy slub', 'Green Textiles Ltd', 'Recyclable cotton. Remove trims for proper recycling', '/p/2024-ROY-002', 'active', 'published', 0)`);

  db.run(`INSERT INTO batches (style_id, variant_id, batch_number, production_date, quantity, material_composition, supplier, recycling_info, passport_url, status, lifecycle_status, archived)
    VALUES (3, NULL, '2024-LINEN-001', '2024-01-20', 400, '100% Linen', 'Linen Collective', 'Linen is naturally biodegradable and compostable', '/p/2024-LINEN-001', 'active', 'archived', 1)`, () => {
      console.log('✓ Database seeded with Style → Batch structure');
      db.close();
    });
});
