const express = require('express');
const db = require('../db');
const router = express.Router();

// GET edit variant form (must come before /:variant_id)
router.get('/:variant_id/edit', (req, res) => {
  const variant_id = req.params.variant_id;

  db.get(
    `SELECT v.*, s.style_id, s.style_name, s.style_number FROM variants v
     JOIN styles s ON v.style_id = s.style_id
     WHERE v.variant_id = ?`,
    [variant_id],
    (err, variant) => {
      if (err) return res.status(500).send('Database error');
      if (!variant) return res.status(404).send('Variant not found');
      res.render('variant-form', { variant });
    }
  );
});

// GET variant detail with batches
router.get('/:variant_id', (req, res) => {
  const variant_id = req.params.variant_id;

  db.get(
    `SELECT v.*, s.style_id, s.style_number, s.style_name
     FROM variants v
     JOIN styles s ON v.style_id = s.style_id
     WHERE v.variant_id = ?`,
    [variant_id],
    (err, variant) => {
      if (err) return res.status(500).send('Database error');
      if (!variant) return res.status(404).send('Variant not found');

      db.all(
        'SELECT * FROM batches WHERE variant_id = ? ORDER BY created_at DESC',
        [variant_id],
        (err, batches) => {
          if (err) return res.status(500).send('Database error');
          res.render('variant-detail', { variant, batches: batches || [] });
        }
      );
    }
  );
});

// POST delete variant (must come before POST /:variant_id)
router.post('/:variant_id/delete', (req, res) => {
  const variant_id = req.params.variant_id;

  db.get('SELECT style_id FROM variants WHERE variant_id = ?', [variant_id], (err, variant) => {
    if (err) return res.status(500).send('Database error');
    if (!variant) return res.status(404).send('Variant not found');

    const style_id = variant.style_id;

    db.run('DELETE FROM batches WHERE variant_id = ?', [variant_id], (err) => {
      if (err) return res.status(500).send('Error deleting variant batches');
      db.run('DELETE FROM variants WHERE variant_id = ?', [variant_id], (err) => {
        if (err) return res.status(500).send('Error deleting variant');
        res.redirect(`/styles/${style_id}`);
      });
    });
  });
});

// POST update variant
router.post('/:variant_id', (req, res) => {
  const variant_id = req.params.variant_id;
  const { variant_code, variant_name, image_url } = req.body;

  if (!variant_code || variant_code.length !== 3 || !/^[A-Z0-9]{3}$/i.test(variant_code)) {
    return res.status(400).send('Variant code must be exactly 3 characters (letters or numbers)');
  }

  db.get('SELECT style_id FROM variants WHERE variant_id = ?', [variant_id], (err, variant) => {
    if (err) return res.status(500).send('Database error');
    if (!variant) return res.status(404).send('Variant not found');

    db.run(
      `UPDATE variants SET variant_code = ?, variant_name = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ?`,
      [variant_code.toUpperCase(), variant_name || null, image_url || null, variant_id],
      (err) => {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).send('Variant code already exists for this style');
          }
          return res.status(500).send('Error updating variant: ' + err.message);
        }
        res.redirect(`/variants/${variant_id}`);
      }
    );
  });
});

// POST create variant
router.post('/', (req, res) => {
  const { style_id, variant_code, variant_name, image_url } = req.body;

  if (!variant_code || variant_code.length !== 3 || !/^[A-Z0-9]{3}$/i.test(variant_code)) {
    return res.status(400).send('Variant code must be exactly 3 characters (letters or numbers)');
  }

  db.run(
    `INSERT INTO variants (style_id, variant_code, variant_name, image_url)
     VALUES (?, ?, ?, ?)`,
    [style_id, variant_code.toUpperCase(), variant_name || null, image_url || null],
    (err) => {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).send('Variant code already exists for this style');
        }
        return res.status(500).send('Error creating variant: ' + err.message);
      }
      res.redirect(`/styles/${style_id}`);
    }
  );
});

module.exports = router;
