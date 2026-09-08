const express = require('express');
const router = express.Router();
const consumerService = require('../../services/consumer-service');

// Get consumer passport (JSON API)
router.get('/passport/:serialNumber', async (req, res) => {
  try {
    const result = await consumerService.getConsumerPassportJson(req.params.serialNumber);

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
router.get('/:serialNumber', async (req, res) => {
  try {
    const result = await consumerService.getConsumerPassportJson(req.params.serialNumber);

    if (!result) {
      return res.status(404).render('consumer/passport-not-found', {
        serialNumber: req.params.serialNumber
      });
    }

    res.render('consumer/passport', {
      passport: result.passport,
      formattedCategories: result.formattedCategories,
      qrUrl: result.url
    });
  } catch (err) {
    res.status(500).render('consumer/passport-error', {
      error: err.message
    });
  }
});

module.exports = router;
