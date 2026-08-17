const express = require('express');
const router = express.Router();
const { db } = require('../../db/init');

// GET batches list
router.get('/', (req, res) => {
  const search = req.query.search || '';
  const isJsonRequest = req.headers['content-type']?.includes('application/json');

  let query = 'SELECT b.*, (SELECT COUNT(*) FROM serials WHERE batch_id = b.batch_id) as serial_count FROM batches b WHERE b.deleted_at IS NULL';
  const params = [];

  if (search) {
    query += ' AND (b.batch_id LIKE ? OR b.partner_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY b.created_at DESC';

  db.all(query, params, (err, batches) => {
    if (err) {
      if (isJsonRequest) return res.status(500).json({ error: 'Database error: ' + err.message });
      return res.status(500).send('Database error');
    }

    res.json({ batches: batches || [] });
  });
});

// GET batch detail with data
router.get('/:batch_id', (req, res) => {
  const { batch_id } = req.params;
  const isJsonRequest = req.headers['content-type']?.includes('application/json');

  db.get('SELECT * FROM batches WHERE batch_id = ? AND deleted_at IS NULL', [batch_id], (err, batch) => {
    if (err) {
      if (isJsonRequest) return res.status(500).json({ error: 'Database error' });
      return res.status(500).send('Database error');
    }

    if (!batch) {
      if (isJsonRequest) return res.status(404).json({ error: 'Batch not found' });
      return res.status(404).send('Batch not found');
    }

    // Get batch data
    db.all('SELECT key, value FROM batch_data WHERE batch_id = ?', [batch_id], (err, data) => {
      if (err) {
        if (isJsonRequest) return res.status(500).json({ error: 'Database error' });
        return res.status(500).send('Database error');
      }

      // Convert array of {key, value} to object
      const batchData = {};
      (data || []).forEach(d => {
        batchData[d.key] = d.value;
      });

      res.json({ ...batch, ...batchData });
    });
  });
});

// POST update batch
router.post('/:batch_id', (req, res) => {
  const { batch_id } = req.params;
  const { total_units, partner_name, ...dataFields } = req.body;
  const isJsonRequest = req.headers['content-type']?.includes('application/json');

  // First check if batch exists
  db.get('SELECT * FROM batches WHERE batch_id = ? AND deleted_at IS NULL', [batch_id], (err, batch) => {
    if (err) {
      if (isJsonRequest) return res.status(500).json({ error: 'Database error' });
      return res.status(500).send('Database error');
    }

    if (!batch) {
      if (isJsonRequest) return res.status(404).json({ error: 'Batch not found' });
      return res.status(404).send('Batch not found');
    }

    // Update batch main fields
    const updates = [];
    const values = [];

    if (total_units !== undefined) {
      updates.push('total_units = ?');
      values.push(total_units);
    }

    if (partner_name !== undefined) {
      updates.push('partner_name = ?');
      values.push(partner_name);
    }

    if (updates.length > 0) {
      values.push(batch_id);

      db.run(
        `UPDATE batches SET ${updates.join(', ')} WHERE batch_id = ?`,
        values,
        (err) => {
          if (err) {
            console.error('Batch update error:', err);
            if (isJsonRequest) return res.status(500).json({ error: 'Error updating batch' });
            return res.status(500).send('Error updating batch');
          }

          updateBatchData();
        }
      );
    } else {
      updateBatchData();
    }

    // Update batch data (key-value)
    function updateBatchData() {
      if (Object.keys(dataFields).length === 0) {
        return sendResponse();
      }

      let completed = 0;
      const errors = [];

      Object.entries(dataFields).forEach(([key, value]) => {
        if (value === null || value === '' || value === undefined) {
          // Delete the entry if empty
          db.run('DELETE FROM batch_data WHERE batch_id = ? AND key = ?', [batch_id, key], (err) => {
            if (err) errors.push(err);
            completed++;
            if (completed === Object.keys(dataFields).length) {
              if (errors.length > 0) {
                console.error('Batch data update errors:', errors);
                if (isJsonRequest) return res.status(500).json({ error: 'Error updating batch data' });
                return res.status(500).send('Error updating batch data');
              }
              sendResponse();
            }
          });
        } else {
          // Insert or update the entry
          db.run(
            'INSERT OR REPLACE INTO batch_data (batch_id, key, value) VALUES (?, ?, ?)',
            [batch_id, key, String(value)],
            (err) => {
              if (err) errors.push(err);
              completed++;
              if (completed === Object.keys(dataFields).length) {
                if (errors.length > 0) {
                  console.error('Batch data update errors:', errors);
                  if (isJsonRequest) return res.status(500).json({ error: 'Error updating batch data' });
                  return res.status(500).send('Error updating batch data');
                }
                sendResponse();
              }
            }
          );
        }
      });
    }

    function sendResponse() {
      res.json({ success: true, batch_id });
    }
  });
});

module.exports = router;
