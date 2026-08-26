const express = require('express');
const router = express.Router();
const { db, queries } = require('../db/init');

// ✨ Helper function to render passport with pass versioning
const renderPassport = (res, serial, batch_id) => {
  const serial_id = serial.id;
  const style_number = serial.style_number;
  const variant = serial.variant;

  // 1. Increment view count + get current pass version to log
  db.get(
    `SELECT pass_version FROM batch_style_data WHERE batch_id = ? AND style_number = ? AND variant ${variant === null ? 'IS NULL' : '= ?'}`,
    variant === null ? [batch_id, style_number] : [batch_id, style_number, variant],
    (err, batchStyleData) => {
      const passVersionViewed = batchStyleData?.pass_version || null;

      // Log page view with pass version
      db.run(
        `INSERT INTO page_views (page_type, page_id, pass_version_viewed) VALUES ('public_passport', ?, ?)`,
        [serial.serial_number, passVersionViewed],
        () => {}
      );

      // Also update legacy view_count
      db.run(`UPDATE serials SET view_count = view_count + 1 WHERE id = ?`, [serial_id], () => {});

      continueRender(passVersionViewed);
    }
  );

  function continueRender(passVersionViewed) {
    // 2. Get batch data
    queries.getBatchData(batch_id, (err, batchData) => {
      // 3. Get batch-style composition (with pass versioning)
      db.get(
        `SELECT composition, pass_version, pass_issued_at, pass_change_type, pass_change_note FROM batch_style_data WHERE batch_id = ? AND style_number = ? AND variant ${variant === null ? 'IS NULL' : '= ?'}`,
        variant === null ? [batch_id, style_number] : [batch_id, style_number, variant],
        (err, batchStyleData) => {
          // 4. Get audit trail for this batch-style
          db.all(
            `SELECT pass_version, composition, pass_issued_at, pass_change_type, pass_change_note FROM batch_style_data_archive WHERE batch_id = ? AND style_number = ? AND variant ${variant === null ? 'IS NULL' : '= ?'} ORDER BY pass_version ASC`,
            variant === null ? [batch_id, style_number] : [batch_id, style_number, variant],
            (err, archiveVersions) => {
              // 5. Get serial-specific data
              queries.getSerialData(serial_id, (err, serialData) => {
                // 6. Get events
                queries.getEvents(serial_id, (err, events) => {
                  // Build pass object with versioning
                  const passData = {
                    version: batchStyleData?.pass_version || 0,
                    issued_at: batchStyleData?.pass_issued_at || null,
                    change_type: batchStyleData?.pass_change_type || 'initial',
                    change_note: batchStyleData?.pass_change_note || null,
                    material_composition: batchStyleData?.composition || null,
                    audit_trail: [
                      ...(archiveVersions || []).map(v => ({
                        version: v.pass_version,
                        issued_at: v.pass_issued_at,
                        change_type: v.pass_change_type,
                        change_note: v.pass_change_note
                      })),
                      batchStyleData && {
                        version: batchStyleData.pass_version,
                        issued_at: batchStyleData.pass_issued_at,
                        change_type: batchStyleData.pass_change_type,
                        change_note: batchStyleData.pass_change_note
                      }
                    ].filter(Boolean)
                  };

                  res.render('passport', {
                    serial,
                    batch_id,
                    batchData: batchData || [],
                    serialData: serialData || [],
                    events: events ? events.map(e => ({
                      ...e,
                      event_data: JSON.parse(e.event_data || '{}')
                    })) : [],
                    pass: passData,
                    passVersionViewed
                  });
                });
              });
            }
          );
        }
      );
    });
  }
};

// GS1 Digital Link format: /01/{gtin-14}/21/{serial}
// Example: /01/05707141145391/21/001
router.get('/01/:gtin_14/21/:serial', (req, res) => {
  const { gtin_14, serial } = req.params;

  // Find serial by serial_number and verify gtin_14 matches style
  db.get(
    `SELECT s.*, st.gtin_14 FROM serials s
     LEFT JOIN styles st ON s.style_number = st.style_number
     WHERE s.serial_number = ? AND st.gtin_14 = ?`,
    [serial, gtin_14],
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

  // Get serial by all three identifiers, including GTIN from styles table
  db.get(
    `SELECT s.*, st.gtin_14 FROM serials s
     LEFT JOIN styles st ON s.style_number = st.style_number
     WHERE s.style_number = ? AND s.batch_id = ? AND s.serial_number = ?`,
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

    // Redirect to GS1 format if gtin_14 is available from styles table
    if (serial.gtin_14) {
      return res.redirect(`/01/${serial.gtin_14}/21/${serial_number}`);
    }

    // Otherwise redirect to legacy format
    res.redirect(`/p/${serial.style_number}/${batch_id}/${serial_number}`);
  });
});

module.exports = router;
