const express = require('express');
const router = express.Router();
const passportResolver = require('../services/passport-resolver');
const scanService = require('../services/scan-service');

/**
 * Public Digital Product Passport
 * URL: /dpp/:batch/:gtin/:sgtin
 * Shows resolved DPP data for individual garment (SGTIN)
 */
router.get('/:batch/:gtin/:sgtin', async (req, res) => {
  try {
    const { batch, gtin, sgtin } = req.params;
    console.log(`[DPP] Searching: batch=${batch}, gtin=${gtin}, sgtin=${sgtin}`);
    const db = require('../db/init-v2').db;

    // Find SGTIN by batch_id, gtin, and serial_number
    const sgtinRecord = await new Promise((resolve, reject) => {
      db.get(
        `SELECT sg.* FROM sgtins sg
         JOIN gtins g ON g.id = sg.gtin_id
         JOIN batches b ON b.id = sg.batch_id
         WHERE b.batch_id = ? AND g.gtin = ? AND sg.serial_number = ?
         LIMIT 1`,
        [batch, gtin, sgtin],
        (err, row) => {
          console.log(`[DPP] Query result:`, err ? err.message : (row ? 'FOUND' : 'NOT_FOUND'));
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!sgtinRecord) {
      return res.status(404).json({ error: 'SGTIN not found', params: { batch, gtin, sgtin } });
    }

    // Log scan event
    await scanService.logScan(sgtinRecord.id, {
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      method: req.query.method || 'qr'
    });

    try {
      // Resolve full passport with inheritance
      const passport = await passportResolver.resolveSgtinPassport(sgtinRecord.id);

      // Get scan stats
      const scanStats = await scanService.getScanStats(sgtinRecord.id);

      // Get lifecycle events
      const events = await new Promise((resolve, reject) => {
        db.all(
          'SELECT * FROM lifecycle_events WHERE sgtin_id = ? ORDER BY created_at DESC',
          [sgtinRecord.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      res.render('dpp-passport', {
        passport,
        scanStats,
        events,
        url: req.originalUrl
      });
    } catch (resolverErr) {
      console.error('[PassportResolver Error]', resolverErr);
      return res.status(500).json({
        error: 'Passport resolver error: ' + resolverErr.message,
        sgtin: sgtinRecord
      });
    }
  } catch (err) {
    console.error('[dpp-passport]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GTIN scan page (register new SGTIN for this GTIN)
 * URL: /dpp/:batch/:gtin/scan
 */
router.get('/:batch/:gtin/scan', async (req, res) => {
  try {
    const { batch, gtin } = req.params;
    const db = require('../db/init-v2').db;

    // Get batch
    const batchRecord = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM batches WHERE batch_id = ?', [batch], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!batchRecord) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Get GTIN
    const gtinRecord = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM gtins WHERE gtin = ?', [gtin], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!gtinRecord) {
      return res.status(404).json({ error: 'GTIN not found' });
    }

    // Resolve GTIN passport
    const gtinPassport = await passportResolver.resolveGtinPassport(gtinRecord.id);

    res.render('dpp-scan-form', {
      batch: batchRecord,
      gtin: gtinRecord,
      gtinPassport
    });
  } catch (err) {
    console.error('[dpp-scan-form]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
