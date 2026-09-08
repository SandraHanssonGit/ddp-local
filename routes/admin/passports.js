const express = require('express');
const router = express.Router();
const passportResolver = require('../../services/passport-resolver');

// Get resolved passport for an SGTIN
router.get('/sgtin/:sgtinId', async (req, res) => {
  try {
    const passport = await passportResolver.resolveSgtinPassport(req.params.sgtinId);
    const valuesByCategory = passportResolver.getResolvedValuesByCategory(passport);

    res.json({
      success: true,
      type: 'sgtin',
      passport: {
        sgtin: passport.sgtin,
        gtin: passport.gtin,
        batch: passport.batch,
        style: passport.style,
        hierarchy: passport.hierarchy
      },
      resolvedFields: passport.resolvedFields,
      valuesByCategory
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get resolved passport for a GTIN
router.get('/gtin/:gtinId', async (req, res) => {
  try {
    const passport = await passportResolver.resolveGtinPassport(req.params.gtinId);
    const valuesByCategory = passportResolver.getResolvedValuesByCategory(passport);

    res.json({
      success: true,
      type: 'gtin',
      passport: {
        gtin: passport.gtin,
        batch: passport.batch,
        style: passport.style,
        hierarchy: passport.hierarchy
      },
      resolvedFields: passport.resolvedFields,
      valuesByCategory
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get resolved passport for a Batch
router.get('/batch/:batchId', async (req, res) => {
  try {
    const passport = await passportResolver.resolveBatchPassport(req.params.batchId);
    const valuesByCategory = passportResolver.getResolvedValuesByCategory(passport);

    res.json({
      success: true,
      type: 'batch',
      passport: {
        batch: passport.batch,
        style: passport.style,
        hierarchy: passport.hierarchy
      },
      resolvedFields: passport.resolvedFields,
      valuesByCategory
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get resolved passport for a Style
router.get('/style/:styleId', async (req, res) => {
  try {
    const passport = await passportResolver.resolveStylePassport(req.params.styleId);
    const valuesByCategory = passportResolver.getResolvedValuesByCategory(passport);

    res.json({
      success: true,
      type: 'style',
      passport: {
        style: passport.style,
        hierarchy: passport.hierarchy
      },
      resolvedFields: passport.resolvedFields,
      valuesByCategory
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get inheritance chain for a specific field
router.get('/sgtin/:sgtinId/field/:fieldKey', async (req, res) => {
  try {
    const passport = await passportResolver.resolveSgtinPassport(req.params.sgtinId);
    const chain = passportResolver.getFieldInheritanceChain(passport, req.params.fieldKey);

    if (!chain) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    res.json({
      success: true,
      sgtin: passport.sgtin,
      field: chain,
      hierarchy: passport.hierarchy
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
