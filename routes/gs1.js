// GS1 Digital Link (ISO/IEC 18975) - ROADMAP.md Phase 3.
// This is the canonical public passport URL going forward (what QR
// codes should point to); the legacy /dpp/:batch/:gtin/:sgtin URL in
// routes/dpp.js stays alive as an internal/admin convenience link.
// Shares its rendering logic with that route via passport-page-service
// so scan logging, ?lang=, and the JSON export can't drift apart
// between the two URLs.
const express = require('express');
const router = express.Router();
const passportPage = require('../services/passport-page-service');

/**
 * URL: /01/:gtin/10/:batch/21/:serial (canonical, includes Batch/Lot -
 * GS1 AI 10 - 2026-09-20 user request: even though GTIN + serial alone
 * already uniquely identify the SGTIN (UNIQUE(gtin_id, serial_number)),
 * Batch is real supply-chain-traceability data GS1 Digital Link
 * supports carrying in the identifier itself, not just inside the
 * passport body. :batch is validated against the SGTIN's actual batch
 * (not just decorative) - a mismatch 404s the same as an unknown
 * serial, so a stale/wrong batch segment in a URL never silently
 * resolves to the wrong unit's data.
 */
router.get('/01/:gtin/10/:batch/21/:serial', async (req, res) => {
  try {
    const { gtin, batch, serial } = req.params;
    const sgtinRecord = await passportPage.findSgtinByGtinSerial(gtin, serial);

    if (!sgtinRecord || !(await passportPage.sgtinBatchMatches(sgtinRecord, batch))) {
      return res.status(404).render('passport-not-found', { serial_number: `${gtin}/${batch}/${serial}` });
    }

    const basePath = `${req.baseUrl}${req.path}`;
    await passportPage.renderPassportPage(req, res, sgtinRecord, basePath);
  } catch (err) {
    console.error('[gs1-passport]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * URL: /01/:gtin/10/:batch/21/:serial/json
 */
router.get('/01/:gtin/10/:batch/21/:serial/json', async (req, res) => {
  try {
    const { gtin, batch, serial } = req.params;
    const sgtinRecord = await passportPage.findSgtinByGtinSerial(gtin, serial);

    if (!sgtinRecord || !(await passportPage.sgtinBatchMatches(sgtinRecord, batch))) {
      return res.status(404).json({ error: 'SGTIN not found', params: { gtin, batch, serial } });
    }

    await passportPage.renderPassportJson(req, res, sgtinRecord);
  } catch (err) {
    console.error('[gs1-json]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * URL: /01/:gtin/21/:serial (legacy, no Batch segment) - kept working
 * for any code already issued without it; GTIN + serial alone is
 * still sufficient to resolve the SGTIN.
 */
router.get('/01/:gtin/21/:serial', async (req, res) => {
  try {
    const { gtin, serial } = req.params;
    const sgtinRecord = await passportPage.findSgtinByGtinSerial(gtin, serial);

    if (!sgtinRecord) {
      return res.status(404).render('passport-not-found', { serial_number: `${gtin}/${serial}` });
    }

    const basePath = `${req.baseUrl}${req.path}`;
    await passportPage.renderPassportPage(req, res, sgtinRecord, basePath);
  } catch (err) {
    console.error('[gs1-passport]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * URL: /01/:gtin/21/:serial/json (legacy, no Batch segment)
 */
router.get('/01/:gtin/21/:serial/json', async (req, res) => {
  try {
    const { gtin, serial } = req.params;
    const sgtinRecord = await passportPage.findSgtinByGtinSerial(gtin, serial);

    if (!sgtinRecord) {
      return res.status(404).json({ error: 'SGTIN not found', params: { gtin, serial } });
    }

    await passportPage.renderPassportJson(req, res, sgtinRecord);
  } catch (err) {
    console.error('[gs1-json]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
