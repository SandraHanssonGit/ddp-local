const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.DB_PATH || 'data/dpp-v2.db';

const db = new sqlite3.Database(DB_PATH);

// Find SGTIN GT-2024-001
db.get('SELECT id FROM sgtins WHERE serial_number = ?', ['GT-2024-001'], (err, sgtin) => {
  if (err || !sgtin) {
    console.log('SGTIN GT-2024-001 not found');
    process.exit(1);
  }

  console.log('\nSGTIN GT-2024-001 found, ID:', sgtin.id);

  // Get lifecycle events for this SGTIN
  db.all('SELECT * FROM lifecycle_events WHERE sgtin_id = ? ORDER BY created_at ASC', [sgtin.id], (err, events) => {
    if (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }

    console.log(`\nLifecycle events for GT-2024-001: ${events.length} total`);
    events.forEach(evt => {
      console.log(`  - ${evt.type} on ${evt.created_at}`);
      console.log(`    Details: ${evt.event_data}`);
    });

    db.close();
  });
});
