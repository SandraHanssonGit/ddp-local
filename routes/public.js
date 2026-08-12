const express = require('express');
const router = express.Router();
const { db, queries } = require('../db/init');

// Public passport page
// Format: /p/:style_number/:batch_id/:serial_number
router.get('/:style_number/:batch_id/:serial_number', (req, res) => {
  const { style_number, batch_id, serial_number } = req.params;

  // Get serial by all three identifiers
  db.get(
    `SELECT * FROM serials WHERE style_number = ? AND batch_id = ? AND serial_number = ?`,
    [style_number, batch_id, serial_number],
    (err, serial) => {
      if (err || !serial) {
        return res.status(404).render('passport-not-found', {
          serial_number: `${style_number}/${batch_id}/${serial_number}`
        });
      }

      const serial_id = serial.id;

      // Get batch data using queries helper
      queries.getBatchData(batch_id, (err, batchData) => {
        // Get serial-specific data
        queries.getSerialData(serial_id, (err, serialData) => {
          // Get events
          queries.getEvents(serial_id, (err, events) => {
            res.render('passport', {
              serial,
              batch_id,
              batchData: batchData || [],
              serialData: serialData || [],
              events: events ? events.map(e => ({
                ...e,
                event_data: JSON.parse(e.event_data || '{}')
              })) : []
            });
          });
        });
      });
    }
  );
});

// Legacy: support old /p/:serial_number format (for backwards compatibility)
router.get('/:serial_number', (req, res) => {
  const { serial_number } = req.params;
  const queries = require('../db/init').queries;

  queries.getSerial(serial_number, (err, serials) => {
    if (err || !serials || serials.length === 0) {
      return res.status(404).render('passport-not-found', { serial_number });
    }

    const serial = serials[0];
    const batch_id = serial.batch_id;
    const serial_id = serial.id;

    // Redirect to new format
    res.redirect(`/p/${serial.style_number}/${batch_id}/${serial_number}`);
  });
});

module.exports = router;
