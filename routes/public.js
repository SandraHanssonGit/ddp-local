const express = require('express');
const router = express.Router();
const { db, queries } = require('../db/init');

// Helper function to render passport
const renderPassport = (res, serial, batch_id) => {
  const serial_id = serial.id;

  // Increment view count
  db.run(`UPDATE serials SET view_count = view_count + 1 WHERE id = ?`, [serial_id], () => {});

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
};

// GS1 Digital Link format: /01/{gtin-14}/21/{serial}
// Example: /01/05707141145391/21/001
router.get('/01/:gtin_14/21/:serial', (req, res) => {
  const { gtin_14, serial } = req.params;

  // Find serial by gtin_14 and serial_number
  db.get(
    `SELECT * FROM serials WHERE gtin_14 = ? AND serial_number = ?`,
    [gtin_14, serial],
    (err, serial_row) => {
      if (err || !serial_row) {
        return res.status(404).render('passport-not-found', {
          serial_number: serial,
          format: 'GS1'
        });
      }

      const batch_id = serial_row.batch_id;
      renderPassport(res, serial_row, batch_id);
    }
  );
});

// Legacy format: /p/:style_number/:batch_id/:serial_number
router.get('/p/:style_number/:batch_id/:serial_number', (req, res) => {
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

      // Redirect to GS1 format if gtin_14 is available
      if (serial.gtin_14) {
        return res.redirect(`/01/${serial.gtin_14}/21/${serial_number}`);
      }

      renderPassport(res, serial, batch_id);
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

    // Redirect to GS1 format if gtin_14 is available
    if (serial.gtin_14) {
      return res.redirect(`/01/${serial.gtin_14}/21/${serial_number}`);
    }

    // Otherwise redirect to legacy format
    res.redirect(`/p/${serial.style_number}/${batch_id}/${serial_number}`);
  });
});

module.exports = router;
