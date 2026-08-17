const express = require('express');
const router = express.Router();
const { db } = require('../../db/init');

// GET batches list
router.get('/', (req, res) => {
  const search = req.query.search || '';
  const isJsonRequest = req.headers['content-type']?.includes('application/json');

  let query = 'SELECT b.*, (SELECT COUNT(*) FROM serials WHERE batch_id = b.batch_id) as serial_count FROM batches b';
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

  db.get('SELECT * FROM batches WHERE batch_id = ?', [batch_id], (err, batch) => {
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
  const { total_units, partner_name, po, production_date, manufacturing_details } = req.body;
  const isJsonRequest = req.headers['content-type']?.includes('application/json');

  // First check if batch exists
  db.get('SELECT * FROM batches WHERE batch_id = ?', [batch_id], (err, batch) => {
    if (err) {
      if (isJsonRequest) return res.status(500).json({ error: 'Database error' });
      return res.status(500).send('Database error');
    }

    if (!batch) {
      if (isJsonRequest) return res.status(404).json({ error: 'Batch not found' });
      return res.status(404).send('Batch not found');
    }

    // Update batch fields
    const updates = [];
    const values = [];

    if (total_units !== undefined && total_units !== null) {
      updates.push('total_units = ?');
      values.push(total_units);
    }

    if (partner_name !== undefined && partner_name !== null) {
      updates.push('partner_name = ?');
      values.push(partner_name);
    }

    if (po !== undefined && po !== null) {
      updates.push('po = ?');
      values.push(po);
    }

    if (production_date !== undefined && production_date !== null) {
      updates.push('production_date = ?');
      values.push(production_date);
    }

    if (manufacturing_details !== undefined && manufacturing_details !== null) {
      updates.push('manufacturing_details = ?');
      values.push(manufacturing_details);
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
          res.json({ success: true, batch_id });
        }
      );
    } else {
      res.json({ success: true, batch_id });
    }
  });
});

module.exports = router;
