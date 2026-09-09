/**
 * Database Cleanup Script
 * Removes all demo/test data while preserving schema
 * Keeps field definitions and configuration
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || 'data/dpp-v2.db';

async function cleanup() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Database connection error:', err.message);
        reject(err);
        return;
      }

      console.log('🧹 Cleaning up database...\n');

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Order matters - respect foreign key constraints
        const tables = [
          'scan_events',
          'lifecycle_events',
          'field_change_log',
          'dpp_values',
          'sgtins',
          'gtins',
          'batches',
          'styles'
        ];

        let completed = 0;

        tables.forEach((table) => {
          db.run(`DELETE FROM ${table}`, function(err) {
            if (err) {
              console.error(`❌ Error deleting from ${table}:`, err.message);
              reject(err);
            } else {
              const count = this.changes;
              console.log(`  ✓ Deleted ${count} rows from ${table}`);
              completed++;

              if (completed === tables.length) {
                // Reset auto-increment sequences
                db.run('DELETE FROM sqlite_sequence', function(err) {
                  if (err) {
                    console.error('❌ Error resetting sequences:', err.message);
                  } else {
                    console.log('  ✓ Reset auto-increment sequences');
                  }

                  db.run('COMMIT', (err) => {
                    if (err) {
                      console.error('❌ Commit error:', err.message);
                      db.run('ROLLBACK');
                      reject(err);
                    } else {
                      console.log('\n✅ Database cleaned successfully!');
                      console.log('\nReady to import real data.');
                      console.log('\nNext steps:');
                      console.log('  1. Prepare CSV with your Nudie catalog');
                      console.log('  2. Go to admin-v2 → Import GTINs');
                      console.log('  3. Upload and preview');
                      console.log('  4. Execute import');
                      resolve();
                    }
                  });
                });
              }
            }
          });
        });
      });

      db.on('error', reject);
    });

    db.on('close', () => {
      console.log('\n✓ Database connection closed');
    });
  });
}

cleanup().catch((err) => {
  console.error('\n❌ Cleanup failed:', err.message);
  process.exit(1);
}).then(() => {
  process.exit(0);
});
