const express = require('express');
const router = express.Router();
const styleRepository = require('../../repositories/styles');
const batchRepository = require('../../repositories/batches');
const gtinRepository = require('../../repositories/gtins');
const sgtinRepository = require('../../repositories/sgtins');
const fieldService = require('../../services/field-service');

// List all styles
router.get('/', async (req, res) => {
  try {
    const styles = await styleRepository.list();
    res.json({ success: true, styles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a new style
router.post('/', async (req, res) => {
  try {
    const { style_number, product_name, product_type } = req.body;

    if (!style_number) {
      return res.status(400).json({ success: false, error: 'style_number is required' });
    }

    const styleId = await styleRepository.create(style_number, product_name, product_type);
    const style = await styleRepository.getById(styleId);

    res.json({ success: true, style });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get style details with hierarchy
router.get('/:styleId', async (req, res) => {
  try {
    const style = await styleRepository.getById(req.params.styleId);
    if (!style) {
      return res.status(404).json({ success: false, error: 'Style not found' });
    }

    const batches = await batchRepository.listByStyle(style.id);

    // Load GTINs for each batch
    for (const batch of batches) {
      batch.gtins = await gtinRepository.listByBatch(batch.id);

      // Load SGTINs for each GTIN
      for (const gtin of batch.gtins) {
        gtin.sgtins = await sgtinRepository.listByGtin(gtin.id);
      }
    }

    res.json({ success: true, style, batches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get style fields and values
router.get('/:styleId/fields', async (req, res) => {
  try {
    const style = await styleRepository.getById(req.params.styleId);
    if (!style) {
      return res.status(404).json({ success: false, error: 'Style not found' });
    }

    const fieldsWithValues = await fieldService.getEntityFieldsWithValues('style', style.id);
    const valuesByCategory = await fieldService.getEntityValuesByCategory('style', style.id);

    res.json({ success: true, fields: fieldsWithValues, valuesByCategory });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Set field value for style
router.post('/:styleId/fields/:fieldKey', async (req, res) => {
  try {
    const style = await styleRepository.getById(req.params.styleId);
    if (!style) {
      return res.status(404).json({ success: false, error: 'Style not found' });
    }

    const { value } = req.body;
    if (value === undefined || value === null) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }

    await fieldService.setValue('style', style.id, req.params.fieldKey, value);
    const updatedFields = await fieldService.getEntityFieldsWithValues('style', style.id);

    res.json({ success: true, fields: updatedFields });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
