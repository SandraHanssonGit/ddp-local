const express = require('express');
const router = express.Router();
const consumerService = require('../../services/consumer-service');
const scanService = require('../../services/scan-service');
const sgtinRepository = require('../../repositories/sgtins');
const gtinRepository = require('../../repositories/gtins');

// Fallback route: Try serial number lookup if GTIN lookup fails
// If user passes just serial number (6 digits), find it and redirect
router.get('/:identifier', async (req, res, next) => {
  const id = req.params.identifier;

  // If it's 6 digits, it's likely a serial number - try to find SGTIN
  if (/^\d{6}$/.test(id)) {
    try {
      const sgtin = await sgtinRepository.getBySerialNumber(id);
      if (sgtin) {
        const gtin = await gtinRepository.getById(sgtin.gtin_id);
        if (gtin) {
          // Redirect to proper SGTIN URL
          return res.redirect(`/dpp/${gtin.gtin}/${id}`);
        }
      }
    } catch (err) {
      console.error('[consumer] Serial lookup error:', err.message);
    }
  }

  next();
});

// Render GTIN-only passport page (lazy SGTIN creation pattern)
// Before first SGTIN assignment, product shows GTIN-level data
// Format: /dpp/:gtin
router.get('/:gtin', async (req, res) => {
  try {
    const result = await consumerService.getConsumerPassportByGtinOnly(req.params.gtin);

    if (!result) {
      return res.status(404).render('consumer/passport-not-found', {
        serialNumber: req.params.gtin,
        gtin: req.params.gtin
      });
    }

    console.log('[consumer] GTIN-only view for:', req.params.gtin);

    res.render('consumer/passport', {
      passport: result,
      formattedCategories: [],
      qrUrl: result.gtin ? consumerService.getQrCodeUrlByGtinOnly(result.gtin) : '',
      events: [],
      resolvedFields: result.resolvedFields || []
    });
  } catch (err) {
    console.error('[consumer] GTIN-only error:', err.message);
    res.status(500).render('consumer/passport-error', {
      error: err.message
    });
  }
});

// Get EU-required fields only (machine-readable JSON)
// Format: /dpp/:gtin/:serialNumber/eu
router.get('/:gtin/:serialNumber/eu', async (req, res) => {
  try {
    const result = await consumerService.getEuRequiredFieldsJsonByGtin(req.params.gtin, req.params.serialNumber);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        serialNumber: req.params.serialNumber
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get consumer passport (JSON API)
// Format: /dpp/:gtin/:serialNumber/json
router.get('/:gtin/:serialNumber/json', async (req, res) => {
  try {
    const result = await consumerService.getConsumerPassportJsonByGtin(req.params.gtin, req.params.serialNumber);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        serialNumber: req.params.serialNumber
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Render consumer passport page (HTML)
// Format: /dpp/:gtin/:serialNumber
router.get('/:gtin/:serialNumber', async (req, res) => {
  try {
    const result = await consumerService.getConsumerPassportJsonByGtin(req.params.gtin, req.params.serialNumber);

    if (!result) {
      return res.status(404).render('consumer/passport-not-found', {
        serialNumber: req.params.serialNumber
      });
    }

    const passportData = result.passport || {};
    const eventsList = passportData.events || [];

    // Log the scan
    if (passportData.sgtin && passportData.sgtin.id) {
      await scanService.logScan(passportData.sgtin.id, {
        location: 'consumer-portal',
        method: 'web',
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      }).catch(err => console.error('[scan] Log error:', err.message));
    }

    // Get scan statistics
    const scanStats = passportData.sgtin?.id
      ? await scanService.getScanStats(passportData.sgtin.id).catch(err => null)
      : null;

    console.log('[consumer] Events to pass:', eventsList.length, 'events');

    res.render('consumer/passport', {
      passport: passportData,
      formattedCategories: result.formattedCategories,
      qrUrl: result.url,
      events: eventsList,
      scanStats: scanStats,
      resolvedFields: passportData.resolvedFields || []
    });
  } catch (err) {
    res.status(500).render('consumer/passport-error', {
      error: err.message
    });
  }
});

module.exports = router;
