const express = require('express');
const router = express.Router();
const db = require('../../db/init-v2').db;
const sgtinRepository = require('../../repositories/sgtins');

const getOne = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const getAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows || []);
  });
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});

// Add GTIN to batch
router.post('/', async (req, res) => {
  try {
    const { batch_id, gtin_id, planned_quantity } = req.body;

    if (!batch_id || !gtin_id || planned_quantity === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const batch = await getOne('SELECT * FROM batches WHERE id = ?', [batch_id]);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const gtin = await getOne('SELECT * FROM gtins WHERE id = ?', [gtin_id]);
    if (!gtin) {
      return res.status(404).json({ error: 'GTIN not found' });
    }

    // Check if already exists
    const existing = await getOne(
      'SELECT * FROM batch_gtins WHERE batch_id = ? AND gtin_id = ?',
      [batch_id, gtin_id]
    );

    if (existing) {
      return res.status(409).json({ error: 'GTIN already in this batch' });
    }

    const result = await run(
      'INSERT INTO batch_gtins (batch_id, gtin_id, planned_quantity) VALUES (?, ?, ?)',
      [batch_id, gtin_id, planned_quantity]
    );

    res.json({
      success: true,
      id: result.lastID,
      message: 'GTIN added to batch'
    });
  } catch (err) {
    console.error('[batch-gtins POST]', err);
    res.status(500).json({ error: err.message });
  }
});

// Produce SGTINs for this GTIN within this batch. Serials continue
// from the highest one this GTIN has ever used, across every batch -
// UNIQUE(gtin_id, serial_number) is not scoped per batch, so restarting
// at 1 per batch would risk a real collision the next time this GTIN
// is produced again.
router.post('/:id/produce-sgtins', async (req, res) => {
  try {
    const batchGtin = await getOne('SELECT * FROM batch_gtins WHERE id = ?', [req.params.id]);
    if (!batchGtin) {
      return res.status(404).json({ error: 'Batch-GTIN not found' });
    }

    const quantity = parseInt(req.body.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    const maxSerial = await sgtinRepository.getMaxSerialForGtin(batchGtin.gtin_id);
    const created = [];
    for (let i = 1; i <= quantity; i++) {
      const serialNumber = String(maxSerial + i).padStart(6, '0');
      const id = await sgtinRepository.create(batchGtin.gtin_id, batchGtin.batch_id, serialNumber);
      created.push({ id, serial_number: serialNumber });
    }

    res.json({ success: true, created });
  } catch (err) {
    console.error('[batch-gtins produce-sgtins]', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove GTIN from batch
router.delete('/:id', async (req, res) => {
  try {
    const batchGtin = await getOne(
      'SELECT * FROM batch_gtins WHERE id = ?',
      [req.params.id]
    );

    if (!batchGtin) {
      return res.status(404).json({ error: 'Batch-GTIN not found' });
    }

    await run('DELETE FROM batch_gtins WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'GTIN removed from batch' });
  } catch (err) {
    console.error('[batch-gtins DELETE]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
