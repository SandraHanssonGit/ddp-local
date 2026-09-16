const express = require('express');
const router = express.Router();
const passportResolver = require('../services/passport-resolver');
const passportPage = require('../services/passport-page-service');

/**
 * Legacy Digital Product Passport URL
 * URL: /dpp/:batch/:gtin/:sgtin
 * Kept as an internal/admin convenience link (ROADMAP.md Phase 3) -
 * the canonical public URL is now GS1 Digital Link (routes/gs1.js).
 * Shares its rendering logic with that route via passport-page-service
 * so scan logging, ?lang=, and the JSON export can't drift apart
 * between the two URLs.
 */
router.get('/:batch/:gtin/:sgtin', async (req, res) => {
  try {
    const { batch, gtin, sgtin } = req.params;
    const sgtinRecord = await passportPage.findSgtinByBatchGtinSerial(batch, gtin, sgtin);

    if (!sgtinRecord) {
      return res.status(404).render('passport-not-found', { serial_number: `${batch}/${gtin}/${sgtin}` });
    }

    const basePath = `${req.baseUrl}${req.path}`;
    await passportPage.renderPassportPage(req, res, sgtinRecord, basePath);
  } catch (err) {
    console.error('[dpp-passport]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Machine-readable JSON export (for the EU DPP registry / interoperability)
 * URL: /dpp/:batch/:gtin/:sgtin/json
 */
router.get('/:batch/:gtin/:sgtin/json', async (req, res) => {
  try {
    const { batch, gtin, sgtin } = req.params;
    const sgtinRecord = await passportPage.findSgtinByBatchGtinSerial(batch, gtin, sgtin);

    if (!sgtinRecord) {
      return res.status(404).json({ error: 'SGTIN not found', params: { batch, gtin, sgtin } });
    }

    await passportPage.renderPassportJson(req, res, sgtinRecord);
  } catch (err) {
    console.error('[dpp-json]', err);
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
