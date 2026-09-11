/**
 * Seed test SGTINs for each product type
 * Creates one SGTIN for: Jeans, Kids, T-shirt
 */
const db = require('../db/init-v2');

const seedTestSgtins = async () => {
  console.log('[Test SGTINs] Creating test garments...\n');

  const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };

  const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  try {
    // Get test batch (assume it exists - PO45001234)
    let batch = await get('SELECT * FROM batches WHERE batch_id = ?', ['PO45001234']);
    if (!batch) {
      console.log('Creating test batch PO45001234...');
      await run(
        'INSERT INTO batches (batch_id, production_order) VALUES (?, ?)',
        ['PO45001234', 'PO-2026-001']
      );
      batch = await get('SELECT * FROM batches WHERE batch_id = ?', ['PO45001234']);
    }

    // 1. JEANS: Pick first jeans GTIN (L30-W24)
    const jeansGtin = await get(
      'SELECT g.* FROM gtins g JOIN styles s ON s.id = g.style_id WHERE s.style_number = ? LIMIT 1',
      ['112327']
    );

    if (jeansGtin) {
      console.log(`Creating Jeans SGTIN for GTIN ${jeansGtin.gtin}...`);
      await run(
        'INSERT INTO sgtins (gtin_id, batch_id, serial_number) VALUES (?, ?, ?)',
        [jeansGtin.id, batch.id, '000001']
      );
      console.log('  ✓ Jeans SGTIN: 000001\n');
    }

    // 2. KIDS: Pick first kids GTIN (K07-B26)
    const kidsGtin = await get(
      'SELECT g.* FROM gtins g JOIN styles s ON s.id = g.style_id WHERE s.style_number = ? LIMIT 1',
      ['910006']
    );

    if (kidsGtin) {
      console.log(`Creating Kids SGTIN for GTIN ${kidsGtin.gtin}...`);
      await run(
        'INSERT INTO sgtins (gtin_id, batch_id, serial_number) VALUES (?, ?, ?)',
        [kidsGtin.id, batch.id, '000001']
      );
      console.log('  ✓ Kids SGTIN: 000001\n');
    }

    // 3. T-SHIRT: Pick first t-shirt GTIN (B01)
    const tshirtGtin = await get(
      'SELECT g.* FROM gtins g JOIN styles s ON s.id = g.style_id WHERE s.style_number = ? LIMIT 1',
      ['131274']
    );

    if (tshirtGtin) {
      console.log(`Creating T-Shirt SGTIN for GTIN ${tshirtGtin.gtin}...`);
      await run(
        'INSERT INTO sgtins (gtin_id, batch_id, serial_number) VALUES (?, ?, ?)',
        [tshirtGtin.id, batch.id, '000001']
      );
      console.log('  ✓ T-Shirt SGTIN: 000001\n');
    }

    console.log('[Test SGTINs] Done! Access at:');
    console.log('  Jeans:   http://localhost:3000/dpp/PO45001234/07311131702606/000001');
    console.log('  Kids:    http://localhost:3000/dpp/PO45001234/07311131277548/000001');
    console.log('  T-Shirt: http://localhost:3000/dpp/PO45001234/07311131312045/000001\n');

    process.exit(0);
  } catch (err) {
    console.error('[Test SGTINs ERROR]', err);
    process.exit(1);
  }
};

seedTestSgtins();
