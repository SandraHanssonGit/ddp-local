/**
 * Direct Import - bypasses API auth by importing directly
 */

const fs = require('fs');
const path = require('path');
const db = require('../db/init-v2').db;
const ImportService = require('../services/import-service');

async function directImport(csvFile) {
  console.log('📤 Importing Nudie Catalog...\n');

  if (!fs.existsSync(csvFile)) {
    console.error(`❌ File not found: ${csvFile}`);
    process.exit(1);
  }

  try {
    // Read CSV
    const content = fs.readFileSync(csvFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    console.log(`Rows to import: ${lines.length - 1}\n`);

    // Step 1: Dry-run
    console.log('Step 1: Preview (dry-run)');
    console.log('─'.repeat(50));

    const previewResult = await ImportService.importFromCSV(content, { dryRun: true });

    console.log(`✓ Preview complete\n`);
    console.log(`Summary:`);
    console.log(`  Created: ${previewResult.created?.length || 0}`);
    console.log(`  Errors: ${previewResult.errors?.length || 0}\n`);

    if (previewResult.errors && previewResult.errors.length > 0) {
      console.log('First 5 errors:');
      previewResult.errors.slice(0, 5).forEach(err => {
        console.log(`  Row ${err.rowIndex}: ${err.message || err.errors?.join('; ')}`);
      });
      console.log();
    }

    if (!previewResult.errors || previewResult.errors.length === 0) {
      // Step 2: Execute
      console.log('Step 2: Execute import');
      console.log('─'.repeat(50));

      const result = await ImportService.importFromCSV(content, { dryRun: false });

      console.log(`✓ Import complete!\n`);
      console.log(`Summary:`);
      console.log(`  Created: ${result.created?.length || 0}`);
      console.log(`  Errors: ${result.errors?.length || 0}\n`);

      console.log('✅ Nudie Catalog imported successfully!\n');
      console.log('Next steps:');
      console.log('  1. Go to http://localhost:3000/admin-v2?tab=gtins');
      console.log('  2. View Master list: 50 new GTINs for Loose Leif L30-L36 × W24-W38');
      console.log('  3. Test consumer: http://localhost:3000/dpp/07311131702606\n');
    } else {
      console.log('❌ Cannot import - fix errors first');
    }

  } catch (err) {
    console.error('❌ Import error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  process.exit(0);
}

// Main
const csvFile = process.argv[2] || 'nudie-catalog_import.csv';
directImport(csvFile);
