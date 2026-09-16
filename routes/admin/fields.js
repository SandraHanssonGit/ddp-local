const express = require('express');
const router = express.Router();
const fieldService = require('../../services/field-service');

// List all field definitions
router.get('/', async (req, res) => {
  try {
    const category = req.query.category || null;
    const fields = await fieldService.listFields(category);
    res.json({ success: true, fields });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a new field definition
router.post('/', async (req, res) => {
  try {
    const {
      field_key, label, category, description, data_type, required, consumer_visible, sort_order,
      editable_at_style, editable_at_variant, editable_at_batch, editable_at_gtin, editable_at_sgtin
    } = req.body;

    if (!field_key || !label || !category) {
      return res.status(400).json({ success: false, error: 'field_key, label, and category are required' });
    }

    const fieldId = await fieldService.createField(field_key, label, category, {
      description,
      data_type: data_type || 'text',
      required: required || false,
      consumer_visible: consumer_visible !== false,
      sort_order: sort_order || 0,
      editable_at_style: editable_at_style !== false,
      editable_at_variant: editable_at_variant !== false,
      editable_at_batch: editable_at_batch !== false,
      editable_at_gtin: editable_at_gtin !== false,
      editable_at_sgtin: editable_at_sgtin !== false
    });

    const field = await fieldService.getField(fieldId);
    res.json({ success: true, field });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get field by ID or key
router.get('/:fieldIdOrKey', async (req, res) => {
  try {
    const field = await fieldService.getField(req.params.fieldIdOrKey);
    if (!field) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    res.json({ success: true, field });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update field
router.put('/:fieldId', async (req, res) => {
  try {
    const {
      label, description, required, consumer_visible, sort_order, category,
      editable_at_style, editable_at_variant, editable_at_batch, editable_at_gtin, editable_at_sgtin
    } = req.body;

    // Only touch fields the caller actually sent - a bare `undefined` bind
    // value throws in sqlite3, and omitting a field from a request body
    // is not the same as explicitly clearing it
    const booleanFields = new Set(['required', 'consumer_visible', 'editable_at_style', 'editable_at_variant', 'editable_at_batch', 'editable_at_gtin', 'editable_at_sgtin']);
    const candidates = { label, description, required, consumer_visible, sort_order, category, editable_at_style, editable_at_variant, editable_at_batch, editable_at_gtin, editable_at_sgtin };
    const updates = {};
    for (const [key, value] of Object.entries(candidates)) {
      if (value === undefined) continue;
      updates[key] = booleanFields.has(key) ? (value ? 1 : 0) : value;
    }

    await fieldService.updateField(req.params.fieldId, updates);

    const field = await fieldService.getField(req.params.fieldId);
    res.json({ success: true, field });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a field definition (refused if any dpp_values still reference it)
router.delete('/:fieldId', async (req, res) => {
  try {
    await fieldService.deleteField(req.params.fieldId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get fields by category
router.get('/category/:category', async (req, res) => {
  try {
    const fields = await fieldService.listFields(req.params.category);
    res.json({ success: true, fields });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
