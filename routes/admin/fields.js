const express = require('express');
const router = express.Router();
const fieldService = require('../../services/field-service');
const fieldRepository = require('../../repositories/fields');
const { SECTION_ICON_OPTIONS } = require('../../utils/section-icons');

// Configurable passport sections (2026-09-20) - registered before the
// '/:fieldIdOrKey' route below so Express doesn't swallow '/sections'
// as a field id/key lookup.
router.get('/sections', async (req, res) => {
  try {
    const sections = await fieldRepository.listSections();
    res.json({ success: true, sections, iconOptions: SECTION_ICON_OPTIONS });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sections', async (req, res) => {
  try {
    const { section_key, label, icon, sort_order } = req.body;
    if (!section_key || !label) {
      return res.status(400).json({ success: false, error: 'section_key and label are required' });
    }
    const safeIcon = SECTION_ICON_OPTIONS.some(o => o.key === icon) ? icon : 'tag';
    const sectionId = await fieldRepository.createSection(section_key, label, safeIcon, sort_order || 0);
    const section = await fieldRepository.getSection(sectionId);
    res.json({ success: true, section });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/sections/:sectionId', async (req, res) => {
  try {
    const { label, icon, sort_order } = req.body;
    const updates = {};
    if (label !== undefined) updates.label = label;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (icon !== undefined) updates.icon = SECTION_ICON_OPTIONS.some(o => o.key === icon) ? icon : 'tag';
    await fieldRepository.updateSection(req.params.sectionId, updates);
    const section = await fieldRepository.getSection(req.params.sectionId);
    res.json({ success: true, section });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/sections/:sectionId', async (req, res) => {
  try {
    await fieldRepository.deleteSection(req.params.sectionId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

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
      field_key, label, category, description, data_type, required, role_ids, sort_order, section_id,
      editable_at_style, editable_at_variant, editable_at_batch, editable_at_gtin, editable_at_batch_gtin, editable_at_sgtin,
      locks_at_production, valid_from, valid_until
    } = req.body;

    if (!field_key || !label || !category) {
      return res.status(400).json({ success: false, error: 'field_key, label, and category are required' });
    }

    const fieldId = await fieldService.createField(field_key, label, category, {
      description,
      data_type: data_type || 'text',
      required: required || false,
      role_ids: Array.isArray(role_ids) ? role_ids.map(Number) : undefined,
      sort_order: sort_order || 0,
      section_id: (section_id === undefined || section_id === '') ? undefined : Number(section_id),
      editable_at_style: editable_at_style !== false,
      editable_at_variant: editable_at_variant !== false,
      editable_at_batch: editable_at_batch !== false,
      editable_at_gtin: editable_at_gtin !== false,
      editable_at_batch_gtin: editable_at_batch_gtin !== false,
      editable_at_sgtin: editable_at_sgtin !== false,
      locks_at_production: locks_at_production === undefined ? undefined : !!locks_at_production,
      valid_from: valid_from || null,
      valid_until: valid_until || null
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
      label, description, required, role_ids, sort_order, category, section_id,
      editable_at_style, editable_at_variant, editable_at_batch, editable_at_gtin, editable_at_batch_gtin, editable_at_sgtin,
      locks_at_production, valid_from, valid_until
    } = req.body;

    // Only touch fields the caller actually sent - a bare `undefined` bind
    // value throws in sqlite3, and omitting a field from a request body
    // is not the same as explicitly clearing it
    const booleanFields = new Set(['required', 'editable_at_style', 'editable_at_variant', 'editable_at_batch', 'editable_at_gtin', 'editable_at_batch_gtin', 'editable_at_sgtin', 'locks_at_production']);
    const candidates = { label, description, required, sort_order, category, editable_at_style, editable_at_variant, editable_at_batch, editable_at_gtin, editable_at_batch_gtin, editable_at_sgtin, locks_at_production };
    const updates = {};
    for (const [key, value] of Object.entries(candidates)) {
      if (value === undefined) continue;
      updates[key] = booleanFields.has(key) ? (value ? 1 : 0) : value;
    }
    // '' means "no section" (cleared in the dropdown) - stored as NULL,
    // not skipped, so clearing an assignment actually takes effect.
    if (section_id !== undefined) {
      updates.section_id = section_id === '' ? null : Number(section_id);
    }
    // Same '' -> NULL treatment for the validity window - an admin
    // clearing the date picker means "valid indefinitely again", not
    // "leave the old date in place".
    if (valid_from !== undefined) updates.valid_from = valid_from || null;
    if (valid_until !== undefined) updates.valid_until = valid_until || null;
    if (Array.isArray(role_ids)) {
      updates.role_ids = role_ids.map(Number);
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
