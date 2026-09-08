const express = require('express');
const router = express.Router();
const overrideService = require('../../services/override-service');
const auditService = require('../../services/audit-service');
const passportResolver = require('../../services/passport-resolver');

// Set an override for an entity
router.post('/:entityType/:entityId/field/:fieldKey', async (req, res) => {
  try {
    const { value, reason } = req.body;

    if (value === undefined || value === null) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }

    const result = await overrideService.setOverride(
      req.params.entityType,
      parseInt(req.params.entityId),
      req.params.fieldKey,
      value,
      { reason }
    );

    res.json({ success: true, override: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Remove an override (revert to inherited value)
router.delete('/:entityType/:entityId/field/:fieldKey', async (req, res) => {
  try {
    const { reason } = req.body || {};

    const result = await overrideService.removeOverride(
      req.params.entityType,
      parseInt(req.params.entityId),
      req.params.fieldKey,
      { reason }
    );

    res.json({ success: true, removed: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all overrides for an entity
router.get('/:entityType/:entityId', async (req, res) => {
  try {
    const overrides = await overrideService.getEntityOverrides(
      req.params.entityType,
      parseInt(req.params.entityId)
    );

    res.json({ success: true, entityType: req.params.entityType, entityId: req.params.entityId, overrides });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get override history for an entity
router.get('/:entityType/:entityId/history', async (req, res) => {
  try {
    const history = await overrideService.getOverrideHistory(
      req.params.entityType,
      parseInt(req.params.entityId)
    );

    const summary = await auditService.getSummary(
      req.params.entityType,
      parseInt(req.params.entityId)
    );

    res.json({ success: true, summary, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get override history for a specific field
router.get('/:entityType/:entityId/field/:fieldKey/history', async (req, res) => {
  try {
    const history = await overrideService.getFieldOverrideHistory(
      req.params.fieldKey,
      req.params.entityType,
      parseInt(req.params.entityId)
    );

    res.json({
      success: true,
      entityType: req.params.entityType,
      entityId: req.params.entityId,
      fieldKey: req.params.fieldKey,
      history
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Set multiple overrides in a batch
router.post('/:entityType/:entityId/batch', async (req, res) => {
  try {
    const { overrides, reason } = req.body;

    if (!overrides || typeof overrides !== 'object') {
      return res.status(400).json({ success: false, error: 'overrides object is required' });
    }

    const result = await overrideService.setMultipleOverrides(
      req.params.entityType,
      parseInt(req.params.entityId),
      overrides,
      { reason }
    );

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get passport before and after override (to show effect)
router.get('/:entityType/:entityId/before-after/:fieldKey', async (req, res) => {
  try {
    const entityType = req.params.entityType;
    const entityId = parseInt(req.params.entityId);
    const fieldKey = req.params.fieldKey;

    // Get current override
    const overrides = await overrideService.getEntityOverrides(entityType, entityId);
    const currentOverride = overrides.find(o => o.field_key === fieldKey);

    const result = {
      success: true,
      entityType,
      entityId,
      fieldKey,
      currentOverride: currentOverride || null,
      message: currentOverride
        ? `Currently overridden with: "${currentOverride.value}"`
        : 'No override set - inheriting from parent'
    };

    // For SGTIN, show full passport
    if (entityType === 'sgtin') {
      const passport = await passportResolver.resolveSgtinPassport(entityId);
      const field = passport.resolvedFields.find(f => f.field_key === fieldKey);
      result.resolvedValue = field ? field.value : null;
      result.sourceLevel = field ? field.sourceLevel : null;
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
