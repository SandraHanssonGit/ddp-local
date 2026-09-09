const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || 'data/dpp-v2.db';

async function updateImages() {
  console.log('[UPDATE] Starting image URL update...\n');

  const db = new sqlite3.Database(DB_PATH);

  const updates = [
    { style_number: '112346', image_url: '/uploads/styles/placeholder-jeans.svg' },
    { style_number: '112310', image_url: '/uploads/styles/placeholder-jeans.svg' },
    { style_number: '140105', image_url: '/uploads/styles/placeholder-chino.svg' },
    { style_number: '131001', image_url: '/uploads/styles/placeholder-tshirt.svg' },
    { style_number: '150301', image_url: '/uploads/styles/placeholder-sweater.svg' }
  ];

  for (const update of updates) {
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE styles SET image_url = ? WHERE style_number = ?',
        [update.image_url, update.style_number],
        function(err) {
          if (err) {
            console.error(`✗ Error updating ${update.style_number}:`, err.message);
            reject(err);
          } else {
            console.log(`✓ Updated ${update.style_number}: ${update.image_url}`);
            resolve();
          }
        }
      );
    });
  }

  db.close();
  console.log('\n[UPDATE] ✅ Image URLs updated!\n');
}

updateImages().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
