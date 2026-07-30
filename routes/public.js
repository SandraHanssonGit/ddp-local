const express = require('express');
const router = express.Router();
const { queries } = require('../db/init');

// Public passport page
router.get('/:serial_number', (req, res) => {
  const { serial_number } = req.params;

  queries.getSerial(serial_number, (err, serials) => {
    if (err || !serials || serials.length === 0) {
      return res.status(404).render('passport-not-found', { serial_number });
    }

    const serial = serials[0];
    const batch_id = serial.batch_id;
    const serial_id = serial.id;

    // Get batch data
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
  });
});

module.exports = router;
