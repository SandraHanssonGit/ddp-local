const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.DB_PATH || 'data/dpp-v2.db';

const db = new sqlite3.Database(DB_PATH);

db.all('SELECT id, style_number, product_name, image_url FROM styles', [], (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  console.log('\nStyles in database:');
  rows.forEach(row => {
    console.log(`  ${row.style_number}: ${row.product_name}`);
    console.log(`    image_url: ${row.image_url || 'NULL'}`);
  });
  db.close();
});
