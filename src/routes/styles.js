const express = require('express');
const db = require('../db');
const router = express.Router();

// GET create style form (must come before /:style_id)
router.get('/new', (req, res) => {
  res.render('style-form', { style: null });
});

// GET style detail with batches or variants
router.get('/:style_id', (req, res) => {
  const style_id = req.params.style_id;

  db.get('SELECT * FROM styles WHERE style_id = ?', [style_id], (err, style) => {
    if (err) return res.status(500).send('Database error');
    if (!style) return res.status(404).send('Style not found');

    if (style.has_variants) {
      // Fetch variants for this style
      db.all('SELECT * FROM variants WHERE style_id = ? ORDER BY created_at DESC', [style_id], (err, batches) => {
        if (err) return res.status(500).send('Database error');
        res.render('style-detail', { style, batches: batches || [] });
      });
    } else {
      // Fetch batches for this style
      db.all('SELECT * FROM batches WHERE style_id = ? AND variant_id IS NULL ORDER BY created_at DESC', [style_id], (err, batches) => {
        if (err) return res.status(500).send('Database error');
        res.render('style-detail', { style, batches: batches || [] });
      });
    }
  });
});

// GET edit style form
router.get('/:style_id/edit', (req, res) => {
  const style_id = req.params.style_id;

  db.get('SELECT * FROM styles WHERE style_id = ?', [style_id], (err, style) => {
    if (err) return res.status(500).send('Database error');
    if (!style) return res.status(404).send('Style not found');
    res.render('style-form', { style });
  });
});

// POST delete style (must come before general /:style_id route)
router.post('/:style_id/delete', (req, res) => {
  const style_id = req.params.style_id;

  db.run('DELETE FROM batches WHERE style_id = ?', [style_id], (err) => {
    if (err) return res.status(500).send('Error deleting style batches');
    db.run('DELETE FROM styles WHERE style_id = ?', [style_id], (err) => {
      if (err) return res.status(500).send('Error deleting style');
      res.redirect('/');
    });
  });
});

// POST update style
router.post('/:style_id', (req, res) => {
  const style_id = req.params.style_id;
  const { style_number, style_name, product_type, material_composition, supplier, country_of_origin, care_instructions, certification_name, certification_url, image_url, gtin, has_variants } = req.body;

  db.run(
    'UPDATE styles SET style_number = ?, style_name = ?, product_type = ?, material_composition = ?, supplier = ?, country_of_origin = ?, care_instructions = ?, certification_name = ?, certification_url = ?, image_url = ?, gtin = ?, has_variants = ?, updated_at = CURRENT_TIMESTAMP WHERE style_id = ?',
    [style_number, style_name, product_type, material_composition, supplier, country_of_origin, care_instructions, certification_name, certification_url, image_url, gtin || null, has_variants ? 1 : 0, style_id],
    (err) => {
      if (err) return res.status(500).send('Error updating style: ' + err.message);
      res.redirect(`/styles/${style_id}`);
    }
  );
});

// POST create style
router.post('/', (req, res) => {
  const { style_number, style_name, product_type, material_composition, supplier, country_of_origin, care_instructions, certification_name, certification_url, image_url, gtin, has_variants } = req.body;

  db.run(
    'INSERT INTO styles (style_number, style_name, product_type, material_composition, supplier, country_of_origin, care_instructions, certification_name, certification_url, image_url, gtin, has_variants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [style_number, style_name, product_type, material_composition, supplier, country_of_origin, care_instructions, certification_name, certification_url, image_url, gtin || null, has_variants ? 1 : 0],
    function(err) {
      if (err) return res.status(500).send('Error creating style: ' + err.message);
      res.redirect(`/styles/${this.lastID}`);
    }
  );
});

module.exports = router;
