/**
 * Migration: Add Variants table and restructure GTIN uniqueness
 *
 * Changes:
 * 1. Create variants table (style_id, variant_name)
 * 2. Add variant_id to gtins table
 * 3. Change GTIN uniqueness from (style_id, gtin) to just (gtin)
 * 4. Update indexes
 */

const db = require('./init-v2').db;

async function migrate() {
  console.log('\n🔄 Migrating Variants structure...\n');

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Step 1: Create variants table
      console.log('Step 1: Creating variants table...');
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
        if (err) {
          console.error('❌ Error creating variants:', err.message);
          reject(err);
          return;
        }
        console.log('✓ variants table created');

        // Step 2: Add variant_id to gtins (if not already there)
        console.log('Step 2: Adding variant_id to gtins...');
        db.run(`ALTER TABLE gtins ADD COLUMN variant_id INTEGER`, (err) => {
          // It's okay if column already exists
          if (err && !err.message.includes('duplicate')) {
            console.error('❌ Error adding variant_id:', err.message);
            reject(err);
            return;
          }
          console.log('✓ variant_id added to gtins');

          // Step 3: Add FK constraint for variant_id
          console.log('Step 3: Creating new gtins table with updated constraints...');
          db.run(`
            CREATE TABLE IF NOT EXISTS gtins_v3 (
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
            if (err) {
              console.error('❌ Error creating gtins_v3:', err.message);
              reject(err);
              return;
            }
            console.log('✓ gtins_v3 created with UNIQUE(gtin)');

            // Step 4: Copy data from gtins to gtins_v3
            console.log('Step 4: Copying GTIN data...');
            db.run(`
              INSERT INTO gtins_v3
              (id, style_id, variant_id, gtin, ean, size, color, variant, weight, product_type, item_number, size_value_1, size_value_2, size_value_3, created_at, updated_at)
              SELECT
                id, style_id, variant_id, gtin, ean, size, color, variant, weight, product_type, item_number, size_value_1, size_value_2, size_value_3, created_at, updated_at
              FROM gtins
            `, (err) => {
              if (err) {
                console.error('❌ Error copying GTIN data:', err.message);
                reject(err);
                return;
              }
              console.log('✓ GTIN data copied');

              // Step 5: Drop old gtins and rename
              console.log('Step 5: Replacing gtins table...');
              db.run('DROP TABLE gtins', (err) => {
                if (err) {
                  console.error('❌ Error dropping gtins:', err.message);
                  reject(err);
                  return;
                }
                db.run('ALTER TABLE gtins_v3 RENAME TO gtins', (err) => {
                  if (err) {
                    console.error('❌ Error renaming gtins_v3:', err.message);
                    reject(err);
                    return;
                  }
                  console.log('✓ gtins table replaced');

                  console.log('\n✅ Migration complete!\n');
                  console.log('Summary:');
                  console.log('  • Created variants table (for product type variations)');
                  console.log('  • GTINs now link to variants via variant_id');
                  console.log('  • GTIN is now globally unique UNIQUE(gtin)');
                  console.log('  • For jeans: variant_id is NULL');
                  console.log('  • For topwear: variant_id points to Red/Blue/etc');
                  resolve();
                });
              });
            });
          });
        });
      });
    });
  });
}

// Run migration
migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
