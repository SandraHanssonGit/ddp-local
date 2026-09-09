const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.DB_PATH || 'data/dpp-v2.db';

const db = new sqlite3.Database(DB_PATH);

db.all('SELECT id, style_number, product_name, image_url FROM styles WHERE style_number = ?', ['112346'], (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log('Style 112346 not found!');
    process.exit(1);
  }

  const style = rows[0];
  console.log('\nStyle 112346 (Grim Tim):');
  console.log('  ID:', style.id);
  console.log('  Name:', style.product_name);
  console.log('  Image URL:', style.image_url);
  console.log('  Image URL is null/empty:', !style.image_url);

  db.close();
});
