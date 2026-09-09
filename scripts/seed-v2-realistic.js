const styleRepository = require('../repositories/styles');
const batchRepository = require('../repositories/batches');
const gtinRepository = require('../repositories/gtins');
const sgtinRepository = require('../repositories/sgtins');
const fieldService = require('../services/field-service');
const db = require('../db/init-v2');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || 'data/dpp-v2.db';

async function seedRealisticData() {
  console.log(`\n[SEED] Starting realistic Nudie Jeans data seed\n`);

  try {
    // Create field definitions
    console.log('[SEED] Creating field definitions...');

    const fiberCompositionId = await fieldService.createField(
      'fiber_composition',
      'Fiber Composition',
      'eu_required',
      { description: 'Material composition of the garment', data_type: 'text', editable_at_style: 1, editable_at_batch: 0, editable_at_gtin: 0, editable_at_sgtin: 0 }
    );

    const careInstructionsId = await fieldService.createField(
      'care_instructions',
      'Care Instructions',
      'eu_required',
      { description: 'How to care for the garment', data_type: 'text', editable_at_style: 1, editable_at_batch: 0, editable_at_gtin: 1, editable_at_sgtin: 1 }
    );

    const countryOfOriginId = await fieldService.createField(
      'country_of_origin',
      'Country of Origin',
      'eu_required',
      { description: 'Country where the garment was manufactured', data_type: 'text', editable_at_style: 1, editable_at_batch: 1, editable_at_gtin: 0, editable_at_sgtin: 0 }
    );

    const sustainabilityId = await fieldService.createField(
      'sustainability_info',
      'Sustainability Information',
      'nudie',
      { description: 'Environmental impact and sustainability practices', data_type: 'text', editable_at_style: 1, editable_at_batch: 0, editable_at_gtin: 0, editable_at_sgtin: 0 }
    );

    const repairProgramId = await fieldService.createField(
      'repair_program',
      'Repair Program',
      'nudie',
      { description: 'Information about Nudie repair services', data_type: 'text', editable_at_style: 1, editable_at_batch: 0, editable_at_gtin: 0, editable_at_sgtin: 0 }
    );

    const secondhandProgramId = await fieldService.createField(
      'secondhand_program',
      'Secondhand Program',
      'nudie',
      { description: 'Information about Nudie secondhand platform', data_type: 'text', editable_at_style: 1, editable_at_batch: 0, editable_at_gtin: 0, editable_at_sgtin: 0 }
    );

    console.log('[SEED] ✓ 6 field definitions created\n');

    // Create Nudie Jeans Styles
    console.log('[SEED] Creating Nudie Jeans Styles...');

    // Grim Tim
    const grimTim = await styleRepository.create('112346', 'Grim Tim', 'Jeans');
    await fieldService.setValue('style', grimTim, 'fiber_composition', '100% Organic Cotton (GOTS certified)');
    await fieldService.setValue('style', grimTim, 'care_instructions', 'Cold wash with similar colours. Dry naturally. Do not tumble dry.');
    await fieldService.setValue('style', grimTim, 'country_of_origin', 'Tunisia');
    await fieldService.setValue('style', grimTim, 'sustainability_info', 'Made with 100% GOTS certified organic cotton. No pesticides, no GMO. Produced with sustainable water management practices.');
    await fieldService.setValue('style', grimTim, 'repair_program', 'Free repairs for life at Nudie Repair Shops worldwide. Extend the life of your jeans.');
    await fieldService.setValue('style', grimTim, 'secondhand_program', 'Sell your worn Nudie jeans on Nudie Exchange. Give them a second life.');
    // Skinny Lin
    const skinnyLin = await styleRepository.create('112310', 'Skinny Lin', 'Jeans');
    await fieldService.setValue('style', skinnyLin, 'fiber_composition', '99% Organic Cotton, 1% Elastane');
    await fieldService.setValue('style', skinnyLin, 'care_instructions', 'Cold wash with similar colours. Dry naturally. Do not tumble dry.');
    await fieldService.setValue('style', skinnyLin, 'country_of_origin', 'Tunisia');
    await fieldService.setValue('style', skinnyLin, 'sustainability_info', 'Organic cotton blend with slight stretch. Produced with minimal environmental impact.');
    await fieldService.setValue('style', skinnyLin, 'repair_program', 'Free repairs for life at Nudie Repair Shops worldwide.');
    await fieldService.setValue('style', skinnyLin, 'secondhand_program', 'Trade or sell your worn jeans on Nudie Exchange.');
    // Set placeholder image
    await new Promise((resolve, reject) => {
      db.db.run('UPDATE styles SET image_url = ? WHERE id = ?', ['/uploads/styles/placeholder-jeans.svg', skinnyLin], function(err) {
        if (err) reject(err); else resolve();
      });
    });

    // Steady Eddie II (Chino)
    const steadyEddie = await styleRepository.create('140105', 'Steady Eddie II', 'Chino');
    await fieldService.setValue('style', steadyEddie, 'fiber_composition', '100% Organic Cotton Twill');
    await fieldService.setValue('style', steadyEddie, 'care_instructions', 'Warm wash. Dry naturally or tumble dry on low heat.');
    await fieldService.setValue('style', steadyEddie, 'country_of_origin', 'Portugal');
    await fieldService.setValue('style', steadyEddie, 'sustainability_info', 'Organic cotton twill chino. Timeless wardrobe essential.');
    await fieldService.setValue('style', steadyEddie, 'repair_program', 'Free repairs available at Nudie Repair Shops.');
    await fieldService.setValue('style', steadyEddie, 'secondhand_program', 'Nudie Exchange available for all garments.');
    // Set placeholder image
    await new Promise((resolve, reject) => {
      db.db.run('UPDATE styles SET image_url = ? WHERE id = ?', ['/uploads/styles/placeholder-chino.svg', steadyEddie], function(err) {
        if (err) reject(err); else resolve();
      });
    });

    // Roy Heavy Slub T-Shirt
    const royTshirt = await styleRepository.create('131001', 'Roy Heavy Slub T-Shirt', 'T-Shirt');
    await fieldService.setValue('style', royTshirt, 'fiber_composition', '100% Organic Cotton Heavy Slub Jersey');
    await fieldService.setValue('style', royTshirt, 'care_instructions', 'Warm wash with similar colours. Tumble dry low or hang dry.');
    await fieldService.setValue('style', royTshirt, 'country_of_origin', 'India');
    await fieldService.setValue('style', royTshirt, 'sustainability_info', 'Heavy slub organic cotton. Premium comfort with unique texture. Produced with sustainable practices.');
    await fieldService.setValue('style', royTshirt, 'repair_program', 'Nudie Repair for longevity and sustainability.');
    await fieldService.setValue('style', royTshirt, 'secondhand_program', 'Extend product life through Nudie Exchange.');
    // Set placeholder image
    await new Promise((resolve, reject) => {
      db.db.run('UPDATE styles SET image_url = ? WHERE id = ?', ['/uploads/styles/placeholder-tshirt.svg', royTshirt], function(err) {
        if (err) reject(err); else resolve();
      });
    });

    // Uno Crewneck Sweater
    const unoSweater = await styleRepository.create('150301', 'Uno Crewneck Sweater', 'Sweater');
    await fieldService.setValue('style', unoSweater, 'fiber_composition', '100% Organic Cotton Knit');
    await fieldService.setValue('style', unoSweater, 'care_instructions', 'Warm wash inside out. Tumble dry low. Remove promptly to avoid wrinkles.');
    await fieldService.setValue('style', unoSweater, 'country_of_origin', 'India');
    await fieldService.setValue('style', unoSweater, 'sustainability_info', 'Classic crewneck in soft organic cotton. Timeless design for longevity.');
    await fieldService.setValue('style', unoSweater, 'repair_program', 'Free repairs for all garments at Nudie Repair Shops.');
    await fieldService.setValue('style', unoSweater, 'secondhand_program', 'Keep your favorite sweaters alive on Nudie Exchange.');
    // Set placeholder image
    await new Promise((resolve, reject) => {
      db.db.run('UPDATE styles SET image_url = ? WHERE id = ?', ['/uploads/styles/placeholder-sweater.svg', unoSweater], function(err) {
        if (err) reject(err); else resolve();
      });
    });

    console.log('[SEED] ✓ 5 Nudie Jeans Styles created (3 bottoms, 2 tops)\n');

    // Create Batches with multi-style GTINs
    console.log('[SEED] Creating Production Batches...');

    // Batch 1 - Tunisia Production 2024-Q1
    const batch1 = await batchRepository.create('TUN-2024-Q1-001', {
      production_order: 'PO-2024-001234',
      production_date: '2024-01-15',
      factory: 'Prestige Tunisie',
      country_of_production: 'Tunisia',
      supplier: 'Prestige Tunisie'
    });

    // Grim Tim GTINs (Batch 1)
    const grimTim30 = await gtinRepository.create(batch1, grimTim, '5711814012346', { size: '30', color: 'Dry Navy' });
    const grimTim32 = await gtinRepository.create(batch1, grimTim, '5711814012353', { size: '32', color: 'Dry Navy' });
    const grimTim34 = await gtinRepository.create(batch1, grimTim, '5711814012360', { size: '34', color: 'Dry Navy' });

    // Skinny Lin GTINs (Batch 1) - Different style in same batch
    const skinnyLin30 = await gtinRepository.create(batch1, skinnyLin, '5711814012310', { size: '30', color: 'Black Black' });
    const skinnyLin32 = await gtinRepository.create(batch1, skinnyLin, '5711814012327', { size: '32', color: 'Black Black' });

    console.log('[SEED] ✓ Batch 1 (Tunisia Q1) created with 5 GTINs (2 styles)\n');

    // Batch 2 - Portugal Production 2024-Q1
    const batch2 = await batchRepository.create('POR-2024-Q1-001', {
      production_order: 'PO-2024-002345',
      production_date: '2024-02-01',
      factory: 'Landes SA',
      country_of_production: 'Portugal',
      supplier: 'Landes SA'
    });

    // Steady Eddie GTINs (Batch 2)
    const steadyEddie30 = await gtinRepository.create(batch2, steadyEddie, '5711814001051', { size: '30', color: 'Khaki' });
    const steadyEddie32 = await gtinRepository.create(batch2, steadyEddie, '5711814001068', { size: '32', color: 'Khaki' });

    // Roy T-Shirt GTINs - Antracite (Batch 2)
    const royAntraciteS = await gtinRepository.create(batch2, royTshirt, '5711814013100', { size: 'S', color: 'Antracite' });
    const royAntraciteM = await gtinRepository.create(batch2, royTshirt, '5711814013117', { size: 'M', color: 'Antracite' });
    const royAntraciteL = await gtinRepository.create(batch2, royTshirt, '5711814013124', { size: 'L', color: 'Antracite' });
    const royAntraciteXL = await gtinRepository.create(batch2, royTshirt, '5711814013131', { size: 'XL', color: 'Antracite' });
    const royAntraciteXXL = await gtinRepository.create(batch2, royTshirt, '5711814013148', { size: 'XXL', color: 'Antracite' });

    // Roy T-Shirt GTINs - Ecru (Batch 2)
    const royEcruS = await gtinRepository.create(batch2, royTshirt, '5711814013155', { size: 'S', color: 'Ecru' });
    const royEcruM = await gtinRepository.create(batch2, royTshirt, '5711814013162', { size: 'M', color: 'Ecru' });
    const royEcruL = await gtinRepository.create(batch2, royTshirt, '5711814013179', { size: 'L', color: 'Ecru' });
    const royEcruXL = await gtinRepository.create(batch2, royTshirt, '5711814013186', { size: 'XL', color: 'Ecru' });
    const royEcruXXL = await gtinRepository.create(batch2, royTshirt, '5711814013193', { size: 'XXL', color: 'Ecru' });

    console.log('[SEED] ✓ Batch 2 (Portugal Q1) created with 12 GTINs (Steady Eddie + Roy T-Shirt)\n');

    // Create SGTINs with globally unique serial numbers
    // Batch 1: 000001-000099
    // Batch 2: 000100-000199
    console.log('[SEED] Creating Individual Garments (SGTINs)...');

    const sgtins = [];
    let serialCounter = 1;

    // Grim Tim Size 30 - 3 units (Batch 1)
    sgtins.push(await sgtinRepository.create(grimTim30, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF001' }));
    sgtins.push(await sgtinRepository.create(grimTim30, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF002' }));
    sgtins.push(await sgtinRepository.create(grimTim30, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF003' }));

    // Grim Tim Size 32 - 3 units (Batch 1)
    sgtins.push(await sgtinRepository.create(grimTim32, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF101' }));
    sgtins.push(await sgtinRepository.create(grimTim32, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF102' }));

    // Skinny Lin Size 30 - 2 units (Batch 1)
    sgtins.push(await sgtinRepository.create(skinnyLin30, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF201' }));
    sgtins.push(await sgtinRepository.create(skinnyLin30, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF202' }));

    // Move to Batch 2 serial range (start at 000100)
    serialCounter = 100;

    // Steady Eddie Size 30 - 2 units (Batch 2)
    sgtins.push(await sgtinRepository.create(steadyEddie30, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF301' }));
    sgtins.push(await sgtinRepository.create(steadyEddie30, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF302' }));

    // Roy T-Shirt Antracite - 2 units each size (Batch 2)
    sgtins.push(await sgtinRepository.create(royAntraciteM, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF401' }));
    sgtins.push(await sgtinRepository.create(royAntraciteM, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF402' }));
    sgtins.push(await sgtinRepository.create(royAntraciteL, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF403' }));

    // Roy T-Shirt Ecru - 2 units each size (Batch 2)
    sgtins.push(await sgtinRepository.create(royEcruM, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF404' }));
    sgtins.push(await sgtinRepository.create(royEcruM, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF405' }));
    sgtins.push(await sgtinRepository.create(royEcruL, String(serialCounter++).padStart(6, '0'), { qc_status: 'Passed', rfid_id: 'RF406' }));

    console.log(`[SEED] ✓ ${sgtins.length} individual garments created\n`);

    // Add SGTIN-level overrides
    console.log('[SEED] Adding field overrides...');
    await fieldService.setValue('sgtin', sgtins[0], 'care_instructions', 'Cold wash, special care - pre-shrunk');
    await fieldService.setValue('sgtin', sgtins[5], 'fiber_composition', '98% Organic Cotton, 2% Elastane (extra stretch)');
    console.log('[SEED] ✓ Override examples added\n');

    // Add lifecycle events for some SGTINs
    console.log('[SEED] Adding lifecycle events...');
    const lifecycleService = require('../services/lifecycle-service');

    // Manufactured events for all SGTINs
    for (const sgtin of sgtins) {
      await lifecycleService.addEvent(sgtin, 'manufactured', {
        factory: 'Prestige Tunisie',
        qc_status: 'Passed'
      });
    }

    // Add some additional events to first few SGTINs
    await lifecycleService.addEvent(sgtins[0], 'sold', { retailer: 'Nudie Jeans Store' });
    await lifecycleService.addEvent(sgtins[1], 'quality_checked', { result: 'Passed' });
    await lifecycleService.addEvent(sgtins[2], 'packaged', { location: 'Borås, Sweden' });

    console.log('[SEED] ✓ Lifecycle events added\n');

    // Create demo users
    console.log('[SEED] Creating demo users...');

    const userDb = new sqlite3.Database(DB_PATH);

    const demoUsers = [
      { username: 'demo', password: 'password', role: 'admin' },
      { username: 'admin', password: 'admin', role: 'super_admin' },
      { username: 'sandra', password: 'password', role: 'super_admin' }
    ];

    for (const user of demoUsers) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await new Promise((resolve, reject) => {
        userDb.run(
          `INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`,
          [user.username, hashedPassword, user.role],
          function(err) {
            if (err) reject(err);
            else {
              console.log(`  ✓ User: ${user.username} (${user.role})`);
              resolve();
            }
          }
        );
      });
    }

    userDb.close();

    console.log('\n[SEED] ✅ Realistic Nudie Jeans data seeding complete!\n');
    console.log('[SEED] Summary:');
    console.log('  Styles: 5 (Grim Tim, Skinny Lin, Steady Eddie II, Roy T-Shirt, Uno Sweater)');
    console.log('  Batches: 2 (Tunisia Q1, Portugal Q1)');
    console.log('  GTINs: 17 (Batch 1: 5, Batch 2: 12 including Roy 2 colors × 5 sizes)');
    console.log(`  SGTINs: ${sgtins.length} (individual garments with color/size variants)`);
    console.log('  Field Definitions: 6 (EU + Nudie categories)');
    console.log('  Users: 3 (demo, admin, sandra)\n');

  } catch (error) {
    console.error('[SEED] ❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedRealisticData().then(() => {
    process.exit(0);
  });
}

module.exports = seedRealisticData;
