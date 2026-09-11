/**
 * Parse Nudie Jeans Catalog to Import Format
 * Converts Excel export to CSV suitable for DPP import
 *
 * Input columns needed:
 * - Item number (e.g., 112327-L30-W24)
 * - Name (e.g., Loose Leif Crispy Faded)
 * - Alias number (EAN-13, e.g., 7311131702606)
 */

const fs = require('fs');
const path = require('path');
const db = require('../db/init-v2').db;

async function parseNudieCatalog(inputFile, batchId = 'NUDIE-2024-01') {
  console.log('📖 Parsing Nudie Jeans Catalog\n');

  // Read input file
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ File not found: ${inputFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(inputFile, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  // Skip header
  const rows = lines.slice(1).map(line => {
    const parts = line.split('\t');
    return {
      item_number: parts[0]?.trim(),
      sts: parts[1]?.trim(),
      itp: parts[2]?.trim(),
      name: parts[3]?.trim(),
      atp30: parts[4]?.trim(),
      customs_no: parts[5]?.trim(),
      specification: parts[6]?.trim(),
      pur_price: parts[7]?.trim(),
      supplier: parts[8]?.trim(),
      alias_number: parts[9]?.trim(),
      ch_dt: parts[10]?.trim(),
      resp: parts[11]?.trim(),
      f4: parts[12]?.trim(),
      nt_wt: parts[13]?.trim(),
      sp5: parts[14]?.trim(),
    };
  }).filter(r => r.item_number && r.alias_number);

  console.log(`Found ${rows.length} products\n`);

  // Group by style
  const byStyle = {};
  rows.forEach(row => {
    const styleParts = row.item_number.split('-');
    const style = styleParts[0];

    if (!byStyle[style]) {
      byStyle[style] = {
        style_number: style,
        product_name: row.name,
        items: []
      };
    }
    byStyle[style].items.push(row);
  });

  // Generate CSV - note: style_id will be resolved by import system
  let csv = 'style_number,product_name,batch_id,item_number,gtin,notes\n';

  Object.values(byStyle).forEach(style => {
    style.items.forEach(item => {
      // GTIN: Alias number is EAN-13, convert to EAN-14 by adding 0 prefix
      const ean13 = item.alias_number;
      const ean14 = '0' + ean13; // Add leading zero for 14-digit GTIN

      // ImportService will resolve style_id from style_number
      csv += `${style.style_number},"${style.product_name}",${batchId},${item.item_number},${ean14},"Item: ${item.item_number} | Supplier: ${item.supplier}"\n`;
    });
  });

  // Write output
  const outputFile = inputFile.replace(/\.[^.]+$/, '_import.csv');
  fs.writeFileSync(outputFile, csv, 'utf-8');

  console.log('✅ Import file created!\n');
  console.log(`Output: ${outputFile}`);
  console.log(`Rows: ${rows.length}`);
  console.log(`Styles: ${Object.keys(byStyle).length}`);
  console.log('\nNext steps:');
  console.log('1. Copy the CSV file');
  console.log('2. Go to http://localhost:3000/admin-v2');
  console.log('3. Click "+ Import GTINs"');
  console.log('4. Upload the CSV');
  console.log('5. Preview and execute\n');

  return outputFile;
}

// Usage
const inputFile = process.argv[2] || 'nudie-catalog.txt';
const batchId = process.argv[3] || 'NUDIE-2024-01';

parseNudieCatalog(inputFile, batchId);
