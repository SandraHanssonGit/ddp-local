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
 * URL: /01/:gtin/21/:serial
 * sgtins has UNIQUE(gtin_id, serial_number), so GTIN + serial alone
 * uniquely identify the SGTIN - no batch needed in the URL.
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
 * URL: /01/:gtin/21/:serial/json
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
