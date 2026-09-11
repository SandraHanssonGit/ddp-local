/**
 * Migration: Fix GTIN-Batch relationship
 *
 * Problem: GTIN was bound to ONE batch (batch_id on gtins table)
 * Solution: GTIN is batch-agnostic, SGTIN specifies which batch it came from
 *
 * Changes:
 * 1. Create new gtins_v2 table WITHOUT batch_id
 * 2. Add batch_id to sgtins table
 * 3. Migrate GTIN data (remove batch_id)
 * 4. Migrate SGTIN data (add batch_id from parent GTIN's batch)
 * 5. Drop old gtins table
 * 6. Rename gtins_v2 to gtins
 */

const db = require('./init-v2').db;

async function migrate() {
  console.log('\n🔄 Migrating GTIN-Batch relationship...\n');

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Step 1: Create new gtins table (without batch_id)
      console.log('Step 1: Creating new gtins_v2 table...');
      db.run(`
        CREATE TABLE IF NOT EXISTS gtins_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          style_id INTEGER NOT NULL,
          gtin TEXT NOT NULL,
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
          UNIQUE(style_id, gtin)
        )
      `, (err) => {
        if (err) {
          console.error('❌ Error creating gtins_v2:', err.message);
          reject(err);
          return;
        }
        console.log('✓ gtins_v2 created');

        // Step 2: Copy GTIN data (without batch_id)
        console.log('Step 2: Copying GTIN data...');
        db.run(`
          INSERT INTO gtins_v2
          (id, style_id, gtin, ean, size, color, variant, weight, product_type, item_number, size_value_1, size_value_2, size_value_3, created_at, updated_at)
          SELECT
            id, style_id, gtin, ean, size, color, variant, weight, product_type, item_number, size_value_1, size_value_2, size_value_3, created_at, updated_at
          FROM gtins
        `, (err) => {
          if (err) {
            console.error('❌ Error copying GTIN data:', err.message);
            reject(err);
            return;
          }
          console.log('✓ GTIN data copied');

          // Step 3: Add batch_id to sgtins
          console.log('Step 3: Adding batch_id to sgtins...');
          db.run(`
            ALTER TABLE sgtins ADD COLUMN batch_id INTEGER
          `, (err) => {
            // It's okay if column already exists
            if (err && !err.message.includes('duplicate')) {
              console.error('❌ Error adding batch_id to sgtins:', err.message);
              reject(err);
              return;
            }
            console.log('✓ batch_id added to sgtins');

            // Step 4: Migrate SGTIN data (set batch_id from old GTIN records)
            console.log('Step 4: Migrating SGTIN batch_id...');
            db.run(`
              UPDATE sgtins
              SET batch_id = (
                SELECT batch_id FROM gtins WHERE gtins.id = sgtins.gtin_id
              )
            `, (err) => {
              if (err) {
                console.error('❌ Error updating SGTIN batch_id:', err.message);
                reject(err);
                return;
              }
              console.log('✓ SGTIN batch_id updated');

              // Step 5: Drop old gtins table
              console.log('Step 5: Dropping old gtins table...');
              db.run('DROP TABLE gtins', (err) => {
                if (err) {
                  console.error('❌ Error dropping gtins:', err.message);
                  reject(err);
                  return;
                }
                console.log('✓ Old gtins dropped');

                // Step 6: Rename gtins_v2 to gtins
                console.log('Step 6: Renaming gtins_v2 to gtins...');
                db.run('ALTER TABLE gtins_v2 RENAME TO gtins', (err) => {
                  if (err) {
                    console.error('❌ Error renaming gtins_v2:', err.message);
                    reject(err);
                    return;
                  }
                  console.log('✓ gtins_v2 renamed to gtins');

                  // Step 7: Add foreign key constraint for batch_id on sgtins
                  console.log('Step 7: Adding FK constraint to sgtins.batch_id...');
                  // SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we skip this for now
                  // The constraint should be in the schema for new installs
                  console.log('✓ (deferred - recreate from schema for new installs)');

                  console.log('\n✅ Migration complete!\n');
                  console.log('Summary:');
                  console.log('  • GTIN is now batch-agnostic (no batch_id on gtins table)');
                  console.log('  • SGTIN now references both GTIN and Batch');
                  console.log('  • Same GTIN can be produced in multiple batches');
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
