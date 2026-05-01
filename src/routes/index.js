const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  db.all('SELECT * FROM styles ORDER BY created_at DESC', (err, styles) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    res.render('index', { styles: styles || [] });
  });
});

module.exports = router;
