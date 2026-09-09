const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const styleRepository = require('../../repositories/styles');
const batchRepository = require('../../repositories/batches');
const gtinRepository = require('../../repositories/gtins');
const sgtinRepository = require('../../repositories/sgtins');
const fieldService = require('../../services/field-service');

// Image upload config
const uploadDir = path.join(__dirname, '../../public/uploads/styles');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `style-${req.params.styleId}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

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

// Upload style image
router.post('/:styleId/image', upload.single('image'), async (req, res) => {
  try {
    const style = await styleRepository.getById(req.params.styleId);
    if (!style) {
      return res.status(404).json({ success: false, error: 'Style not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    // Build image URL
    const imageUrl = `/uploads/styles/${req.file.filename}`;

    // Store in database (update styles table with image_url)
    const db = require('../../db/init-v2').db;
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE styles SET image_url = ? WHERE id = ?',
        [imageUrl, req.params.styleId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ success: true, image_url: imageUrl });
  } catch (err) {
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete style image
router.delete('/:styleId/image', async (req, res) => {
  try {
    const style = await styleRepository.getById(req.params.styleId);
    if (!style) {
      return res.status(404).json({ success: false, error: 'Style not found' });
    }

    if (!style.image_url) {
      return res.status(404).json({ success: false, error: 'No image to delete' });
    }

    // Delete file
    const filePath = path.join(__dirname, `../../public${style.image_url}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Clear database
    const db = require('../../db/init-v2').db;
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE styles SET image_url = NULL WHERE id = ?',
        [req.params.styleId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update style (PATCH)
router.patch('/:styleId', async (req, res) => {
  try {
    const style = await styleRepository.getById(req.params.styleId);
    if (!style) {
      return res.status(404).json({ success: false, error: 'Style not found' });
    }

    await styleRepository.update(req.params.styleId, req.body);
    const updated = await styleRepository.getById(req.params.styleId);

    res.json({ success: true, style: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save DPP values for style
router.post('/:styleId/dpp-values', async (req, res) => {
  try {
    const style = await styleRepository.getById(req.params.styleId);
    if (!style) {
      return res.status(404).json({ success: false, error: 'Style not found' });
    }

    // Save each field value
    for (const [fieldKey, value] of Object.entries(req.body)) {
      if (value) {
        await fieldService.setValue('style', style.id, fieldKey, value);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
