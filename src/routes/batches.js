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
      res.render('batch-detail', { batch });
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
      res.render('batch-edit', { batch });
    }
  );
});

// POST create batch
router.post('/', (req, res) => {
  const { style_id, variant_id, batch_number, production_date, quantity, material_composition, supplier, recycling_info, passport_url } = req.body;

  db.run(
    `INSERT INTO batches (style_id, variant_id, batch_number, production_date, quantity, material_composition, supplier, recycling_info, passport_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [style_id, variant_id || null, batch_number, production_date, quantity, material_composition || null, supplier || null, recycling_info, passport_url],
    (err) => {
      if (err) return res.status(500).send('Error creating batch');
      const redirect_url = variant_id ? `/variants/${variant_id}` : `/styles/${style_id}`;
      res.redirect(redirect_url);
    }
  );
});

// POST update batch
router.post('/:batch_id', (req, res) => {
  const batch_id = req.params.batch_id;
  const { production_date, quantity, material_composition, supplier, recycling_info, passport_url, status } = req.body;

  db.run(
    `UPDATE batches SET production_date = ?, quantity = ?, material_composition = ?, supplier = ?, recycling_info = ?, passport_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE batch_id = ?`,
    [production_date, quantity, material_composition || null, supplier || null, recycling_info, passport_url, status, batch_id],
    (err) => {
      if (err) return res.status(500).send('Error updating batch');
      res.redirect(`/batches/${batch_id}`);
    }
  );
});

// POST delete batch
router.post('/:batch_id/delete', (req, res) => {
  const batch_id = req.params.batch_id;

  db.run('DELETE FROM batches WHERE batch_id = ?', [batch_id], (err) => {
    if (err) return res.status(500).send('Error deleting batch');
    res.redirect('/');
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
