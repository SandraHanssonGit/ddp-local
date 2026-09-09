const styleRepository = require('../repositories/styles');
const batchRepository = require('../repositories/batches');
const gtinRepository = require('../repositories/gtins');
const sgtinRepository = require('../repositories/sgtins');
const fieldService = require('../services/field-service');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || 'data/dpp-v2.db';

async function seedDemoData() {
  console.log(`\n[SEED] Starting demo data seed for v2 (${DB_PATH})\n`);

  try {
    // Create field definitions
    console.log('[SEED] Creating field definitions...');

    // EU-required fields
    const fiberCompositionId = await fieldService.createField(
      'fiber_composition',
      'Fiber Composition',
      'eu_required',
      { description: 'Material composition of the garment', data_type: 'text' }
    );

    const careInstructionsId = await fieldService.createField(
      'care_instructions',
      'Care Instructions',
      'eu_required',
      { description: 'How to care for the garment', data_type: 'text' }
    );

    const countryOfOriginId = await fieldService.createField(
      'country_of_origin',
      'Country of Origin',
      'eu_required',
      { description: 'Country where the garment was manufactured', data_type: 'text' }
    );

    // Nudie-specific fields
    const sustainabilityId = await fieldService.createField(
      'sustainability_info',
      'Sustainability Information',
      'nudie',
      { description: 'Nudie Jeans sustainability practices', data_type: 'text' }
    );

    const repairProgramId = await fieldService.createField(
      'repair_program',
      'Repair Program',
      'nudie',
      { description: 'Information about Nudie repair services', data_type: 'text' }
    );

    const secondhandProgramId = await fieldService.createField(
      'secondhand_program',
      'Secondhand Program',
      'nudie',
      { description: 'Information about Nudie secondhand program', data_type: 'text' }
    );

    console.log('[SEED] ✓ 6 field definitions created\n');

    // Create Styles
    console.log('[SEED] Creating Styles...');
    const style1 = await styleRepository.create('114519', 'Classic Jeans', 'Denim');
    const style2 = await styleRepository.create('114526', 'Skinny Jeans', 'Denim');
    console.log('[SEED] ✓ 2 styles created\n');

    // Set Style-level DPP values
    await fieldService.setValue('style', style1, 'fiber_composition', '100% Cotton');
    await fieldService.setValue('style', style1, 'care_instructions', 'Wash in 30°C');
    await fieldService.setValue('style', style1, 'sustainability_info', 'Made from organic cotton');
    await fieldService.setValue('style', style1, 'repair_program', 'Free repair for 1 year');

    await fieldService.setValue('style', style2, 'fiber_composition', '99% Cotton, 1% Elastane');
    await fieldService.setValue('style', style2, 'care_instructions', 'Wash in 30°C, do not bleach');
    await fieldService.setValue('style', style2, 'country_of_origin', 'Cambodia');

    console.log('[SEED] ✓ Style-level field values created\n');

    // Create Batch (independent of style)
    console.log('[SEED] Creating Batches...');
    const batch1 = await batchRepository.create('PO45001234', {
      production_order: 'Order-001',
      production_date: '2024-01-15',
      factory: 'Cambodia',
      country_of_production: 'Cambodia'
    });
    console.log('[SEED] ✓ Batch PO45001234 created\n');

    // Create GTINs for Batch 1 - from MULTIPLE styles
    console.log('[SEED] Creating GTINs for Batch (multi-style)...');
    const gtin1 = await gtinRepository.create(batch1, style1, '5707141145391', { size: '30', color: 'Blue' });
    const gtin2 = await gtinRepository.create(batch1, style1, '5707141145392', { size: '32', color: 'Blue' });
    const gtin3 = await gtinRepository.create(batch1, style2, '5707141145407', { size: '28', color: 'Black' });
    const gtin4 = await gtinRepository.create(batch1, style2, '5707141145408', { size: '30', color: 'Black' });
    console.log('[SEED] ✓ 4 GTINs created (2x Style 114519, 2x Style 114526)\n');

    // Set Batch-level override
    await fieldService.setValue('batch', batch1, 'country_of_origin', 'Vietnam');
    console.log('[SEED] ✓ Batch-level override created\n');

    // Create SGTINs
    console.log('[SEED] Creating SGTINs...');
    const sgtin1 = await sgtinRepository.create(gtin1, 'ABC001', { qc_status: 'Passed' });
    const sgtin2 = await sgtinRepository.create(gtin1, 'ABC002', { qc_status: 'Passed' });
    const sgtin3 = await sgtinRepository.create(gtin2, 'ABC003', { qc_status: 'Passed' });
    const sgtin4 = await sgtinRepository.create(gtin3, 'ABC004', { qc_status: 'Passed' });
    const sgtin5 = await sgtinRepository.create(gtin4, 'ABC005', { qc_status: 'Passed' });
    console.log('[SEED] ✓ 5 SGTINs created\n');

    // Set SGTIN-level override
    await fieldService.setValue('sgtin', sgtin1, 'fiber_composition', '100% Organic Cotton (Premium)');

    // Create Additional Batches for completeness
    console.log('[SEED] Creating additional batches...');
    const batch2 = await batchRepository.create('PO45001345', {
      production_order: 'Order-002',
      production_date: '2024-02-01',
      factory: 'Vietnam'
    });

    const gtin5 = await gtinRepository.create(batch2, style1, '5707141145440', { size: '34', color: 'Dark Blue' });
    const gtin6 = await gtinRepository.create(batch2, style2, '5707141145460', { size: '32', color: 'Gray' });
    console.log('[SEED] ✓ Additional batch created\n');

    // Create more SGTINs
    const sgtin6 = await sgtinRepository.create(gtin5, 'ABC006', { qc_status: 'Passed' });
    const sgtin7 = await sgtinRepository.create(gtin6, 'ABC007', { qc_status: 'Passed' });
    const sgtin8 = await sgtinRepository.create(gtin6, 'ABC008', { qc_status: 'Passed' });
    const sgtin9 = await sgtinRepository.create(gtin6, 'ABC009', { qc_status: 'Passed' });

    console.log('[SEED] ✓ 4 more SGTINs created\n');

    // Seed demo users
    console.log('[SEED] Creating demo users...');

    const db = new sqlite3.Database(DB_PATH);

    const demoUsers = [
      { username: 'demo', password: 'password', role: 'admin' },
      { username: 'admin', password: 'admin', role: 'super_admin' },
      { username: 'sandra', password: 'password', role: 'super_admin' }
    ];

    for (const user of demoUsers) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await new Promise((resolve, reject) => {
        db.run(
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

    db.close();

    console.log('[SEED] Demo Data Summary:');
    console.log('  Styles: 2 (114519, 114526)');
    console.log('  Batches: 2 (PO45001234, PO45001345)');
    console.log('  GTINs: 6 (from multiple styles per batch)');
    console.log('  SGTINs: 9 (ABC001-ABC009)');
    console.log('  Fields: 6 (EU + Nudie)');
    console.log('  Users: 3 (demo, admin, sandra)');
    console.log('\n[SEED] ✅ Demo data seeding complete!\n');

  } catch (error) {
    console.error('[SEED] ❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedDemoData().then(() => {
    process.exit(0);
  });
}

module.exports = seedDemoData;
