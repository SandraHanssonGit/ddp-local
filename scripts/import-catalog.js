/**
 * Import Nudie Catalog via API
 * Reads CSV and imports directly to database
 */

const fs = require('fs');
const FormData = require('form-data');
const http = require('http');

async function importCatalog(csvFile, execute = false) {
  const baseUrl = 'http://localhost:3000';

  if (!fs.existsSync(csvFile)) {
    console.error(`❌ File not found: ${csvFile}`);
    process.exit(1);
  }

  console.log('📤 Importing Nudie Catalog...\n');

  // Step 1: Dry-run (preview)
  console.log('Step 1: Preview (dry-run)');
  console.log('─'.repeat(50));

  const form = new FormData();
  form.append('file', fs.createReadStream(csvFile));
  form.append('dryRun', 'true');

  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/admin-v2/import/preview',
      method: 'POST',
      headers: form.getHeaders()
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (json.success) {
            console.log(`✓ Preview successful\n`);
            console.log(`Summary:`);
            console.log(`  Created: ${json.data?.summary?.created || 0}`);
            console.log(`  Skipped: ${json.data?.summary?.skipped || 0}`);
            console.log(`  Errors: ${json.data?.summary?.errors || 0}\n`);

            if (json.data?.errors && json.data.errors.length > 0) {
              console.log('Errors found:');
              json.data.errors.slice(0, 5).forEach(err => {
                console.log(`  Line ${err.line}: ${err.message}`);
              });
              console.log();
            }

            // Step 2: Execute if requested
            if (execute && json.data?.summary?.errors === 0) {
              executeImport(csvFile, baseUrl).then(resolve);
            } else {
              console.log('To execute import, run with --execute flag');
              console.log('Example: node scripts/import-catalog.js nudie-catalog_import.csv --execute\n');
              resolve();
            }
          } else {
            console.error('❌ Preview failed:', json.error || 'Unknown error');
            resolve();
          }
        } catch (e) {
          console.error('❌ Error parsing response:', e.message);
          console.log('Raw response:', data.substring(0, 500));
          resolve();
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Request error:', e.message);
      console.log('\nMake sure server is running: npm start');
      resolve();
    });

    form.pipe(req);
  });
}

async function executeImport(csvFile) {
  console.log('Step 2: Execute import');
  console.log('─'.repeat(50));

  const form = new FormData();
  form.append('file', fs.createReadStream(csvFile));
  form.append('dryRun', 'false');

  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/admin-v2/import/execute',
      method: 'POST',
      headers: form.getHeaders()
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (json.success) {
            console.log(`✓ Import successful!\n`);
            console.log(`Summary:`);
            console.log(`  Created: ${json.data?.summary?.created || 0}`);
            console.log(`  Skipped: ${json.data?.summary?.skipped || 0}`);
            console.log(`  Errors: ${json.data?.summary?.errors || 0}\n`);

            console.log('✅ Catalog imported to database!');
            console.log('\nNext steps:');
            console.log('  1. Go to http://localhost:3000/admin-v2?tab=gtins');
            console.log('  2. View imported GTINs in Master view');
            console.log('  3. Test consumer passport: http://localhost:3000/dpp/07311131702606\n');
          } else {
            console.error('❌ Import failed:', json.error || 'Unknown error');
          }
          resolve();
        } catch (e) {
          console.error('❌ Error parsing response:', e.message);
          resolve();
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Request error:', e.message);
      resolve();
    });

    form.pipe(req);
  });
}

// Main
const csvFile = process.argv[2] || 'nudie-catalog_import.csv';
const execute = process.argv.includes('--execute');

if (!fs.existsSync(csvFile)) {
  console.error(`❌ CSV file not found: ${csvFile}`);
  console.log('\nUsage:');
  console.log('  node scripts/import-catalog.js nudie-catalog_import.csv');
  console.log('  node scripts/import-catalog.js nudie-catalog_import.csv --execute');
  process.exit(1);
}

importCatalog(csvFile, execute).then(() => {
  console.log('Done.\n');
  process.exit(0);
});
