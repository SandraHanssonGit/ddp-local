const express = require('express');
const db = require('../db');
const router = express.Router();

// GET public passport by URL
router.get('/p/:passport', (req, res) => {
  const passport = req.params.passport;
  const passport_url = `/p/${passport}`;

  db.get(
    `SELECT b.*, s.style_number, s.style_name, s.product_type, s.material_composition, s.supplier, s.country_of_origin, s.care_instructions, s.certification_name, s.certification_url, s.image_url as style_image_url, v.variant_code, v.variant_name, v.image_url as variant_image_url
     FROM batches b
     JOIN styles s ON b.style_id = s.style_id
     LEFT JOIN variants v ON b.variant_id = v.variant_id
     WHERE b.passport_url = ?`,
    [passport_url],
    (err, batch) => {
      if (err) return res.status(500).send('Database error');
      if (!batch) return res.status(404).send('Passport not found');
      res.render('passport-public', { batch });
    }
  );
});

module.exports = router;
