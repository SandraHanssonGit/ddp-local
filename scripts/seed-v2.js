const styleRepository = require('../repositories/styles');
const batchRepository = require('../repositories/batches');
const gtinRepository = require('../repositories/gtins');
const sgtinRepository = require('../repositories/sgtins');
const fieldService = require('../services/field-service');

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

    const storytellingId = await fieldService.createField(
      'storytelling',
      'Product Story',
      'nudie',
      { description: 'Story behind the product', data_type: 'text' }
    );

    console.log('[SEED] ✓ 6 field definitions created\n');

    // Create Style 1
    console.log('[SEED] Creating Style 114519...');
    const style1Id = await styleRepository.create(
      '114519',
      'Tight Terry',
      'Jeans'
    );

    // Set Style 1 fields
    await fieldService.setValue('style', style1Id, 'fiber_composition', '99% organic cotton, 1% elastane');
    await fieldService.setValue('style', style1Id, 'care_instructions', 'Wash inside out in cold water, hang dry');
    await fieldService.setValue('style', style1Id, 'country_of_origin', 'Sweden');
    await fieldService.setValue('style', style1Id, 'sustainability_info', 'Made from 100% organic cotton');
    await fieldService.setValue('style', style1Id, 'repair_program', 'Free repair for life at Nudie stores');
    await fieldService.setValue('style', style1Id, 'storytelling', 'Tight fitting, classic Nudie silhouette');

    console.log('[SEED] ✓ Style 114519 created with field values\n');

    // Create Batch 1.1
    console.log('[SEED] Creating Batch PO45001234...');
    const batch1_1Id = await batchRepository.create(
      style1Id,
      'PO45001234',
      {
        production_order: 'PO45001234',
        production_date: '2026-08-15',
        supplier: 'Trimco AB',
        factory: 'Stockholm',
        country_of_production: 'Sweden'
      }
    );

    // Override fiber composition at batch level
    await fieldService.setValue('batch', batch1_1Id, 'fiber_composition', '98% organic cotton, 2% elastane (special blend)');

    console.log('[SEED] ✓ Batch PO45001234 created (with override)\n');

    // Create GTINs for Batch 1.1
    console.log('[SEED] Creating GTINs...');
    const gtin1_1_1Id = await gtinRepository.create(
      batch1_1Id,
      '05707141145391',
      { size: 'M', color: 'Black' }
    );

    const gtin1_1_2Id = await gtinRepository.create(
      batch1_1Id,
      '05707141145407',
      { size: 'L', color: 'Black' }
    );

    console.log('[SEED] ✓ 2 GTINs created\n');

    // Create SGTINs for GTIN 1
    console.log('[SEED] Creating SGTINs...');
    await sgtinRepository.create(batch1_1Id, 'ABC001', { serial_number: 'ABC001', qc_status: 'pass' });
    await sgtinRepository.create(gtin1_1_1Id, 'ABC002', { qc_status: 'pass' });
    await sgtinRepository.create(gtin1_1_1Id, 'ABC003', { qc_status: 'pass' });

    // Create SGTINs for GTIN 2
    await sgtinRepository.create(gtin1_1_2Id, 'ABC004', { qc_status: 'pass' });
    await sgtinRepository.create(gtin1_1_2Id, 'ABC005', { qc_status: 'pass' });

    console.log('[SEED] ✓ 5 SGTINs created\n');

    // Create Batch 1.2
    console.log('[SEED] Creating Batch PO45001345...');
    const batch1_2Id = await batchRepository.create(
      style1Id,
      'PO45001345',
      {
        production_order: 'PO45001345',
        production_date: '2026-09-01',
        supplier: 'Trimco AB',
        factory: 'Gothenburg',
        country_of_production: 'Sweden'
      }
    );

    console.log('[SEED] ✓ Batch PO45001345 created\n');

    // Create GTIN for Batch 1.2
    const gtin1_2_1Id = await gtinRepository.create(
      batch1_2Id,
      '05707141145414',
      { size: 'S', color: 'Dark Blue' }
    );

    // Create SGTINs for this GTIN
    await sgtinRepository.create(gtin1_2_1Id, 'ABC006', { qc_status: 'pass' });
    await sgtinRepository.create(gtin1_2_1Id, 'ABC007', { qc_status: 'pass' });

    console.log('[SEED] ✓ Batch 1.2 with GTINs and SGTINs created\n');

    // Create Style 2
    console.log('[SEED] Creating Style 114526...');
    const style2Id = await styleRepository.create(
      '114526',
      'Grim Tim',
      'Jeans'
    );

    // Set Style 2 fields
    await fieldService.setValue('style', style2Id, 'fiber_composition', '100% organic cotton');
    await fieldService.setValue('style', style2Id, 'care_instructions', 'Wash inside out, gentle cycle, hang dry');
    await fieldService.setValue('style', style2Id, 'country_of_origin', 'Sweden');
    await fieldService.setValue('style', style2Id, 'sustainability_info', 'Fair trade certified organic cotton');
    await fieldService.setValue('style', style2Id, 'repair_program', 'Lifetime repair guarantee');
    await fieldService.setValue('style', style2Id, 'storytelling', 'Classic straight leg cut');

    console.log('[SEED] ✓ Style 114526 created\n');

    // Create Batch for Style 2
    const batch2_1Id = await batchRepository.create(
      style2Id,
      'PO45001456',
      {
        production_order: 'PO45001456',
        production_date: '2026-08-20',
        supplier: 'Trimco AB',
        factory: 'Stockholm',
        country_of_production: 'Sweden'
      }
    );

    // Create GTIN and SGTINs for Style 2
    const gtin2_1_1Id = await gtinRepository.create(
      batch2_1Id,
      '05707141145421',
      { size: 'M', color: 'Raw' }
    );

    await sgtinRepository.create(gtin2_1_1Id, 'DEF001', { qc_status: 'pass' });
    await sgtinRepository.create(gtin2_1_1Id, 'DEF002', { qc_status: 'pass' });

    console.log('[SEED] ✓ Style 114526 hierarchy created\n');

    console.log('[SEED] ✅ Demo data seeding complete!\n');
    console.log('[SEED] Demo Data Summary:');
    console.log('  Styles: 2 (114519, 114526)');
    console.log('  Batches: 3 (PO45001234, PO45001345, PO45001456)');
    console.log('  GTINs: 4');
    console.log('  SGTINs: 9');
    console.log('  Fields: 6 (EU + Nudie)');
    console.log('  Field Values: 15 (Style-level) + 1 (Batch-level override)\n');

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
