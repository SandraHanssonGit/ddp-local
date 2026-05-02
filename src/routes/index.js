const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const search = req.query.search || '';
  const showArchived = req.query.archived === 'true';

  let query = 'SELECT * FROM styles WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (style_number LIKE ? OR style_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, styles) => {
    if (err) return res.status(500).send('Database error');

    // Get statistics
    db.get('SELECT COUNT(*) as total_styles FROM styles', (err, styleCount) => {
      if (err) return res.status(500).send('Database error');

      db.get('SELECT COUNT(*) as total_batches FROM batches WHERE archived = 0', (err, batchCount) => {
        if (err) return res.status(500).send('Database error');

        db.get('SELECT COUNT(*) as archived_batches FROM batches WHERE archived = 1', (err, archivedCount) => {
          if (err) return res.status(500).send('Database error');

          // Get recent changes
          db.all(
            `SELECT cl.*, b.batch_number FROM change_log cl
             LEFT JOIN batches b ON cl.batch_id = b.batch_id
             ORDER BY cl.created_at DESC LIMIT 10`,
            (err, changes) => {
              if (err) return res.status(500).send('Database error');

              // Get recent batches
              db.all(
                `SELECT b.*, s.style_name, v.variant_code FROM batches b
                 JOIN styles s ON b.style_id = s.style_id
                 LEFT JOIN variants v ON b.variant_id = v.variant_id
                 WHERE b.archived = 0
                 ORDER BY b.created_at DESC LIMIT 5`,
                (err, recentBatches) => {
                  if (err) return res.status(500).send('Database error');

                  res.render('index', {
                    styles: styles || [],
                    search,
                    showArchived,
                    stats: {
                      total_styles: styleCount?.total_styles || 0,
                      total_batches: batchCount?.total_batches || 0,
                      archived_batches: archivedCount?.archived_batches || 0
                    },
                    recentChanges: changes || [],
                    recentBatches: recentBatches || []
                  });
                }
              );
            }
          );
        });
      });
    });
  });
});

module.exports = router;
