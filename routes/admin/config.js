const express = require('express');
const router = express.Router();
const fieldService = require('../../services/field-service');

// GET configuration dashboard (HTML)
router.get('/', async (req, res) => {
  try {
    const allFields = await fieldService.listFields();

    // Group by category
    const byCategory = {};
    for (const field of allFields) {
      if (!byCategory[field.category]) {
        byCategory[field.category] = [];
      }
      byCategory[field.category].push(field);
    }

    res.render('admin/config-dashboard', {
      allFields,
      byCategory,
      categoryCount: Object.keys(byCategory).length,
      fieldCount: allFields.length
    });
  } catch (err) {
    res.status(500).render('admin/config-error', { error: err.message });
  }
});

// GET field creation form (HTML)
router.get('/new', async (req, res) => {
  try {
    const categories = ['eu_required', 'nudie'];
    const dataTypes = ['text', 'number', 'date', 'url', 'email', 'json'];

    res.render('admin/field-form', {
      field: null,
      categories,
      dataTypes,
      mode: 'create'
    });
  } catch (err) {
    res.status(500).render('admin/config-error', { error: err.message });
  }
});

// POST create new field (JSON API)
router.post('/fields', async (req, res) => {
  try {
    const { field_key, label, category, description, data_type, required, consumer_visible, sort_order } = req.body;

    const fieldId = await fieldService.createField(field_key, label, category, {
      description,
      data_type: data_type || 'text',
      required: required === 'true' || required === true,
      consumer_visible: consumer_visible !== 'false' && consumer_visible !== false,
      sort_order: parseInt(sort_order) || 0
    });

    const field = await fieldService.getField(fieldId);
    res.json({ success: true, field, message: 'Field created successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET field edit form (HTML)
router.get('/fields/:fieldId/edit', async (req, res) => {
  try {
    const field = await fieldService.getField(req.params.fieldId);
    if (!field) {
      return res.status(404).render('admin/config-error', { error: 'Field not found' });
    }

    const categories = ['eu_required', 'nudie'];
    const dataTypes = ['text', 'number', 'date', 'url', 'email', 'json'];

    res.render('admin/field-form', {
      field,
      categories,
      dataTypes,
      mode: 'edit'
    });
  } catch (err) {
    res.status(500).render('admin/config-error', { error: err.message });
  }
});

// PUT update field (JSON API)
router.put('/fields/:fieldId', async (req, res) => {
  try {
    const { label, category, description, required, consumer_visible, sort_order } = req.body;

    await fieldService.updateField(req.params.fieldId, {
      label,
      category,
      description,
      required: required === 'true' || required === true,
      consumer_visible: consumer_visible !== 'false' && consumer_visible !== false,
      sort_order: parseInt(sort_order) || 0
    });

    const field = await fieldService.getField(req.params.fieldId);
    res.json({ success: true, field, message: 'Field updated successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET all fields (JSON API)
router.get('/fields/api/list', async (req, res) => {
  try {
    const category = req.query.category || null;
    const fields = await fieldService.listFields(category);
    res.json({ success: true, fields });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET field details (JSON API)
router.get('/fields/:fieldId/details', async (req, res) => {
  try {
    const field = await fieldService.getField(req.params.fieldId);
    if (!field) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }
    res.json({ success: true, field });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE field (JSON API)
router.delete('/fields/:fieldId', async (req, res) => {
  try {
    const field = await fieldService.getField(req.params.fieldId);
    if (!field) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    // Check if field has values
    const values = await require('../../repositories/fields').getEntityValues('style', 1); // Just check if any values exist
    const hasValues = values.some(v => v.field_definition_id == req.params.fieldId);

    if (hasValues) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete field that has values assigned. Remove values first.'
      });
    }

    // In a real app, we'd delete it
    res.json({ success: false, message: 'Deletion not yet implemented in UI' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET statistics (JSON API)
router.get('/stats/overview', async (req, res) => {
  try {
    const allFields = await fieldService.listFields();

    const stats = {
      total_fields: allFields.length,
      by_category: {},
      by_type: {},
      required_count: 0,
      consumer_visible_count: 0
    };

    for (const field of allFields) {
      // Category count
      stats.by_category[field.category] = (stats.by_category[field.category] || 0) + 1;

      // Data type count
      stats.by_type[field.data_type] = (stats.by_type[field.data_type] || 0) + 1;

      // Required count
      if (field.required) stats.required_count++;

      // Consumer visible count
      if (field.consumer_visible) stats.consumer_visible_count++;
    }

    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
