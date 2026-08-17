const express = require('express');
const db = require('../db');
const router = express.Router();

// GET batch detail
router.get('/:batch_id', (req, res) => {
  const batch_id = req.params.batch_id;

  db.get(
    `SELECT b.*, s.style_number, s.style_name, s.product_type, s.material_composition, s.supplier, s.country_of_origin, s.care_instructions, s.certification_name, s.certification_url, s.image_url as style_image_url, v.variant_code, v.variant_name, v.image_url as variant_image_url
     FROM batches b
     JOIN styles s ON b.style_id = s.style_id
     LEFT JOIN variants v ON b.variant_id = v.variant_id
     WHERE b.batch_id = ?`,
    [batch_id],
    (err, batch) => {
      if (err) return res.status(500).send('Database error');
      if (!batch) return res.status(404).send('Batch not found');

      // Get change log
      db.all('SELECT * FROM change_log WHERE batch_id = ? ORDER BY created_at DESC', [batch_id], (err, changes) => {
        if (err) return res.status(500).send('Database error');
        res.render('batch-detail', { batch, changes: changes || [] });
      });
    }
  );
});

// GET edit batch form
router.get('/:batch_id/edit', (req, res) => {
  const batch_id = req.params.batch_id;

  db.get(
    `SELECT b.*, s.style_number, s.style_name, s.product_type, s.material_composition, s.supplier, s.country_of_origin, s.care_instructions, s.certification_name, s.certification_url, s.image_url as style_image_url, v.variant_code, v.variant_name, v.image_url as variant_image_url
     FROM batches b
     JOIN styles s ON b.style_id = s.style_id
     LEFT JOIN variants v ON b.variant_id = v.variant_id
     WHERE b.batch_id = ?`,
    [batch_id],
    (err, batch) => {
      if (err) return res.status(500).send('Database error');
      if (!batch) return res.status(404).send('Batch not found');
      res.render('batch-edit', { batch, error: null });
    }
  );
});

// POST create batch
router.post('/', (req, res) => {
  const { style_id, variant_id, batch_number, production_date, quantity, material_composition, supplier, recycling_info } = req.body;

  // Get style and variant info to build passport URL
  db.get('SELECT style_number FROM styles WHERE style_id = ?', [style_id], (err, style) => {
    if (err) return res.status(500).send('Database error');
    if (!style) return res.status(500).send('Style not found');

    let passport_url = `/p/${style.style_number}-${batch_number}`;

    if (variant_id) {
      db.get('SELECT variant_code FROM variants WHERE variant_id = ?', [variant_id], (err, variant) => {
        if (err) return res.status(500).send('Database error');
        if (variant) {
          passport_url = `/p/${style.style_number}-${variant.variant_code}-${batch_number}`;
        }

        db.run(
          `INSERT INTO batches (style_id, variant_id, batch_number, production_date, quantity, material_composition, supplier, recycling_info, passport_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [style_id, variant_id, batch_number, production_date, quantity, material_composition || null, supplier || null, recycling_info, passport_url],
          (err) => {
            if (err) return res.status(500).send('Error creating batch');
            res.redirect(`/variants/${variant_id}`);
          }
        );
      });
    } else {
      db.run(
        `INSERT INTO batches (style_id, variant_id, batch_number, production_date, quantity, material_composition, supplier, recycling_info, passport_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [style_id, null, batch_number, production_date, quantity, material_composition || null, supplier || null, recycling_info, passport_url],
        (err) => {
          if (err) return res.status(500).send('Error creating batch');
          res.redirect(`/styles/${style_id}`);
        }
      );
    }
  });
});

// POST update batch (by batch_number)
router.post('/:batch_number', (req, res) => {
  const batch_number_param = req.params.batch_number;
  const { production_date, quantity, material_composition, supplier, recycling_info, status } = req.body;
  const isJsonRequest = req.headers['content-type'] && req.headers['content-type'].includes('application/json');

  if (!batch_number_param) {
    if (isJsonRequest) {
      return res.status(400).json({ error: 'Batch number is required' });
    }
    return res.status(400).send('Batch number is required');
  }

  // Get batch with style and variant info to regenerate passport URL
  db.get(
    `SELECT b.*, s.style_number, s.style_name, v.variant_code, v.variant_name FROM batches b
     JOIN styles s ON b.style_id = s.style_id
     LEFT JOIN variants v ON b.variant_id = v.variant_id
     WHERE b.batch_number = ?`,
    [batch_number_param],
    (err, batch) => {
      if (err) {
        if (isJsonRequest) return res.status(500).json({ error: 'Database error' });
        return res.status(500).send('Database error');
      }
      if (!batch) {
        if (isJsonRequest) return res.status(404).json({ error: 'Batch not found' });
        return res.status(404).send('Batch not found');
      }

          // Get batch_id for logging and updates
          const batch_id = batch.batch_id;

          // Generate passport URL
          let passport_url = `/p/${batch.style_number}-${batch_number_param}`;
          if (batch.variant_code) {
            passport_url = `/p/${batch.style_number}-${batch.variant_code}-${batch_number_param}`;
          }

          db.run(
            `UPDATE batches SET production_date = ?, quantity = ?, material_composition = ?, supplier = ?, recycling_info = ?, passport_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE batch_number = ?`,
            [production_date || null, quantity || null, material_composition || null, supplier || null, recycling_info || null, passport_url, status || null, batch_number_param],
            (err) => {
              if (err) {
                console.error('Batch update error:', err);
                if (isJsonRequest) return res.status(500).json({ error: 'Error updating batch: ' + err.message });
                return res.status(500).send('Error updating batch: ' + err.message);
              }

              // Log change
              db.run(
                'INSERT INTO change_log (batch_id, change_type, change_description) VALUES (?, ?, ?)',
                [batch_id, 'update', 'Batch updated'],
                () => {
                  // Return JSON if this is a JSON request, otherwise redirect
                  if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
                    res.json({ success: true, batch_number: batch_number_param });
                  } else {
                    res.redirect(`/batches/${batch_id}`);
                  }
                }
              );
            }
          );
        }
      );
    }
  );
});

// POST archive batch (soft delete)
router.post('/:batch_id/delete', (req, res) => {
  const batch_id = req.params.batch_id;

  db.get('SELECT batch_number FROM batches WHERE batch_id = ?', [batch_id], (err, batch) => {
    if (err) return res.status(500).send('Database error');
    if (!batch) return res.status(404).send('Batch not found');

    db.run('UPDATE batches SET archived = 1, lifecycle_status = ? WHERE batch_id = ?', ['archived', batch_id], (err) => {
      if (err) return res.status(500).send('Error archiving batch');

      // Log change
      db.run(
        'INSERT INTO change_log (batch_id, change_type, change_description) VALUES (?, ?, ?)',
        [batch_id, 'archive', `Batch ${batch.batch_number} archived`],
        () => res.redirect('/')
      );
    });
  });
});

// POST update batch lifecycle status
router.post('/:batch_id/status', (req, res) => {
  const batch_id = req.params.batch_id;
  const { lifecycle_status } = req.body;

  if (!['draft', 'published', 'archived'].includes(lifecycle_status)) {
    return res.status(400).send('Invalid status');
  }

  db.get('SELECT batch_number FROM batches WHERE batch_id = ?', [batch_id], (err, batch) => {
    if (err) return res.status(500).send('Database error');
    if (!batch) return res.status(404).send('Batch not found');

    db.run(
      'UPDATE batches SET lifecycle_status = ?, updated_at = CURRENT_TIMESTAMP WHERE batch_id = ?',
      [lifecycle_status, batch_id],
      (err) => {
        if (err) return res.status(500).send('Error updating status');

        // Log change
        db.run(
          'INSERT INTO change_log (batch_id, change_type, change_description) VALUES (?, ?, ?)',
          [batch_id, 'status_change', `Status changed to ${lifecycle_status}`],
          () => res.redirect(`/batches/${batch_id}`)
        );
      }
    );
  });
});

// GET QR code labels
router.get('/:batch_id/qr-labels', (req, res) => {
  const batch_id = req.params.batch_id;
  const quantity = Math.min(parseInt(req.query.quantity) || 20, 1000); // Max 1000

  db.get(
    `SELECT b.*, s.style_number, s.style_name
     FROM batches b
     JOIN styles s ON b.style_id = s.style_id
     WHERE b.batch_id = ?`,
    [batch_id],
    (err, batch) => {
      if (err) return res.status(500).send('Database error');
      if (!batch) return res.status(404).send('Batch not found');
      res.render('qr-labels', { batch, quantity });
    }
  );
});

module.exports = router;
