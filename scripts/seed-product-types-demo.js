/**
 * Phase 6: Seed demo data for all 4 product types
 * Creates realistic product examples to demonstrate the flexible model
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || 'data/dpp-v2.db';
const db = new sqlite3.Database(DB_PATH);

// Product type test data
const DEMO_DATA = {
  // Style 112327: Adult Jeans (Loose Leif Crispy Faded)
  jeans_adult: {
    style: {
      style_number: '112327',
      product_name: 'Loose Leif Crispy Faded',
      product_type: 'Jeans'
    },
    batch_id: 1, // Use existing batch
    items: [
      { item_number: '112327-L30-W24', length: '30', waist: '24', gtin: '5711814031273' },
      { item_number: '112327-L32-W28', length: '32', waist: '28', gtin: '5711814031280' },
      { item_number: '112327-L34-W32', length: '34', waist: '32', gtin: '5711814031297' },
    ]
  },

  // Style 131274: T-Shirt (Raw Hem T-shirt)
  tshirt: {
    style: {
      style_number: '131274',
      product_name: 'Raw Hem T-Shirt',
      product_type: 'T-Shirt'
    },
    batch_id: 1,
    items: [
      { item_number: '131274-B01-001', size: 'XS', variant: 'B01', gtin: '5711814050000' },
      { item_number: '131274-B01-003', size: 'M', variant: 'B01', gtin: '5711814050017' },
      { item_number: '131274-B02-004', size: 'L', variant: 'B02', gtin: '5711814050024' },
    ]
  },

  // Style 910006: Kids Jeans (Tiny Turner Kid Rinsed Wash)
  kids: {
    style: {
      style_number: '910006',
      product_name: 'Tiny Turner Kid Rinsed',
      product_type: 'Kids Jeans'
    },
    batch_id: 1,
    items: [
      { item_number: '910006-B26-K10', kid_size: '10', variant: 'B26', gtin: '5711814090000' },
      { item_number: '910006-B26-K12', kid_size: '12', variant: 'B26', gtin: '5711814090017' },
      { item_number: '910006-B26-K14', kid_size: '14', variant: 'B26', gtin: '5711814090024' },
    ]
  },

  // Style 500001: Belt (No Size)
  no_size: {
    style: {
      style_number: '500001',
      product_name: 'Leather Belt Classic',
      product_type: 'Accessories'
    },
    batch_id: 1,
    items: [
      { item_number: '500001-BLK', variant: 'BLK', gtin: '5711814500001' },
      { item_number: '500001-BRN', variant: 'BRN', gtin: '5711814500018' },
    ]
  }
};

let completed = 0;
let errors = 0;

async function insertData() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      let queryCount = 0;

      for (const [typeKey, typeData] of Object.entries(DEMO_DATA)) {
        const { style, batch_id, items } = typeData;

        // Insert or update style
        db.run(
          `INSERT OR REPLACE INTO styles (style_number, product_name, product_type)
           VALUES (?, ?, ?)`,
          [style.style_number, style.product_name, style.product_type],
          function(err) {
            if (err) {
              console.error(`✗ Style insert error (${typeKey}):`, err.message);
              errors++;
            }
            const styleId = this.lastID || 1;

            // Insert GTINs for this product type
            items.forEach(item => {
              let size_value_1, size_value_2, size_value_3;

              if (typeKey === 'jeans_adult') {
                size_value_1 = item.length;
                size_value_2 = item.waist;
                size_value_3 = null;
              } else if (typeKey === 'tshirt') {
                size_value_1 = item.size;
                size_value_2 = item.variant;
                size_value_3 = null;
              } else if (typeKey === 'kids') {
                size_value_1 = item.kid_size;
                size_value_2 = item.variant;
                size_value_3 = null;
              } else if (typeKey === 'no_size') {
                size_value_1 = null;
                size_value_2 = item.variant;
                size_value_3 = null;
              }

              db.run(
                `INSERT OR REPLACE INTO gtins
                 (batch_id, style_id, gtin, product_type, item_number, size_value_1, size_value_2, size_value_3)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [batch_id, styleId, item.gtin, typeKey, item.item_number, size_value_1, size_value_2, size_value_3],
                function(err) {
                  if (err) {
                    console.error(`✗ GTIN insert error (${item.item_number}):`, err.message);
                    errors++;
                  } else {
                    completed++;
                    console.log(`  ✓ ${item.item_number} (${typeKey})`);
                  }
                  queryCount--;
                  if (queryCount === 0) {
                    db.run('COMMIT', (err) => {
                      if (err) {
                        console.error('Commit error:', err);
                        db.run('ROLLBACK');
                        reject(err);
                      } else {
                        resolve();
                      }
                    });
                  }
                }
              );
              queryCount++;
            });
          }
        );
      }
    });
  });
}

async function main() {
  console.log('=== Phase 6: Seed Demo Data for All Product Types ===\n');
  console.log('Inserting styles and GTINs...\n');

  try {
    await insertData();

    console.log('\n' + '─'.repeat(60));
    console.log(`✓ Completed: ${completed} GTINs inserted`);
    if (errors > 0) {
      console.log(`⚠ Errors: ${errors}`);
    }
    console.log('─'.repeat(60));

    console.log('\nCreated product types:');
    console.log('  • jeans_adult: Adult Jeans (L×W format)');
    console.log('  • tshirt: T-Shirts (Size + Variant)');
    console.log('  • kids: Kids Products (Kid Size + Variant)');
    console.log('  • no_size: Accessories (Variant only)');

    console.log('\nTest URLs:');
    console.log('  Jeans: http://localhost:3000/dpp/5711814031273');
    console.log('  T-Shirt: http://localhost:3000/dpp/5711814050000');
    console.log('  Kids: http://localhost:3000/dpp/5711814090000');
    console.log('  Belt: http://localhost:3000/dpp/5711814500001');

  } catch (err) {
    console.error('Fatal error:', err.message);
  } finally {
    db.close();
    process.exit(errors > 0 ? 1 : 0);
  }
}

main();
