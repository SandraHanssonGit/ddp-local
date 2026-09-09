const express = require('express');
const router = express.Router();
const styleRepository = require('../../repositories/styles');
const batchRepository = require('../../repositories/batches');
const gtinRepository = require('../../repositories/gtins');
const sgtinRepository = require('../../repositories/sgtins');
const fieldService = require('../../services/field-service');
const ProductTypeConfig = require('../../services/product-type-config');
const db = require('../../db/init-v2').db;

// Helper to get counts
const getStyleCounts = async (styles) => {
  for (let style of styles) {
    style.batch_count = await new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(DISTINCT b.id) as count
        FROM gtins g
        JOIN batches b ON g.batch_id = b.id
        WHERE g.style_id = ?
      `, [style.id], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
  }
  return styles;
};

const getBatchCounts = async (batches) => {
  for (let batch of batches) {
    batch.gtin_count = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM gtins WHERE batch_id = ?', [batch.id], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
    batch.style_count = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(DISTINCT style_id) as count FROM gtins WHERE batch_id = ?', [batch.id], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
  }
  return batches;
};

const getGtinCounts = async (gtins) => {
  for (let gtin of gtins) {
    gtin.sgtin_count = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM sgtins WHERE gtin_id = ?', [gtin.id], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
  }
  return gtins;
};

const getSgtinCounts = async (sgtins) => {
  for (let sgtin of sgtins) {
    sgtin.event_count = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM lifecycle_events WHERE sgtin_id = ?', [sgtin.id], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
  }
  return sgtins;
};

// Main hub route
router.get('/', async (req, res) => {
  try {
    const tab = req.query.tab || 'styles';
    const user = { username: 'demo', role: 'admin' };

    let data = { tab, user, styles: [], batches: [], gtins: [], sgtins: [], fields: [] };

    // Always load styles (for filters in other tabs)
    data.styles = await styleRepository.list();
    data.styles = await getStyleCounts(data.styles);

    // Load data based on active tab
    if (tab === 'batches') {
      const styleId = req.query.style;
      let query = `SELECT b.* FROM batches b`;
      let params = [];

      // If filtering by style, get batches that contain GTINs from that style
      if (styleId) {
        query += ` WHERE b.id IN (
          SELECT DISTINCT b.id FROM batches b
          JOIN gtins g ON b.id = g.batch_id
          WHERE g.style_id = ?
        )`;
        params.push(styleId);
      }

      query += ` ORDER BY b.batch_id ASC`;

      data.batches = await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      data.batches = await getBatchCounts(data.batches);
    }

    if (tab === 'gtins') {
      const batchId = req.query.batch;
      let query = `
        SELECT g.*, s.style_number, b.batch_id
        FROM gtins g
        JOIN styles s ON g.style_id = s.id
        JOIN batches b ON g.batch_id = b.id
      `;
      let params = [];

      if (batchId) {
        query += ' WHERE g.batch_id = ?';
        params.push(batchId);
      }

      query += ` ORDER BY s.style_number ASC, g.size ASC`;

      data.gtins = await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      data.gtins = await getGtinCounts(data.gtins);
    }

    if (tab === 'sgtins') {
      const gtinId = req.query.gtin;
      let query = `
        SELECT s.*, g.gtin, st.style_number
        FROM sgtins s
        JOIN gtins g ON s.gtin_id = g.id
        JOIN styles st ON g.style_id = st.id
      `;
      let params = [];

      if (gtinId) {
        query += ' WHERE s.gtin_id = ?';
        params.push(gtinId);
      }

      query += ` ORDER BY s.serial_number ASC`;

      data.sgtins = await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      data.sgtins = await getSgtinCounts(data.sgtins);
    }

    if (tab === 'fields') {
      data.fields = await fieldService.listFields();
    }

    res.render('admin/hub-v2', data);
  } catch (err) {
    console.error('[hub-v2]', err);
    res.status(500).render('admin/hub-v2-error', { error: err.message });
  }
});

// Style detail page
router.get('/styles/:styleId', async (req, res) => {
  try {
    const style = await styleRepository.getById(req.params.styleId);
    if (!style) {
      return res.status(404).render('admin/hub-v2-error', { error: 'Style not found' });
    }

    // Get batches for this style (via GTINs)
    const batches = await new Promise((resolve, reject) => {
      db.all(`
        SELECT DISTINCT b.*
        FROM batches b
        JOIN gtins g ON b.id = g.batch_id
        WHERE g.style_id = ?
        ORDER BY b.batch_id ASC
      `, [style.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Get counts
    const gtinCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM gtins WHERE style_id = ?', [style.id], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });

    const sgtinCount = await new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) as count FROM sgtins sg
        JOIN gtins g ON sg.gtin_id = g.id
        WHERE g.style_id = ?
      `, [style.id], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });

    // Get DPP values for this style (only editable at style level)
    const dppValues = await new Promise((resolve, reject) => {
      db.all(`
        SELECT fd.*, dv.value
        FROM field_definitions fd
        LEFT JOIN dpp_values dv ON fd.id = dv.field_definition_id AND dv.entity_type = 'style' AND dv.entity_id = ?
        WHERE fd.editable_at_style = 1
        ORDER BY fd.sort_order ASC
      `, [style.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    res.render('admin/style-detail', {
      style,
      batches,
      dppValues,
      gtinCount,
      sgtinCount,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[style-detail]', err);
    res.status(500).render('admin/hub-v2-error', { error: err.message });
  }
});

// Batch detail page
router.get('/batches/:batchId', async (req, res) => {
  try {
    const batch = await batchRepository.getById(req.params.batchId);
    if (!batch) {
      return res.status(404).render('admin/hub-v2-error', { error: 'Batch not found' });
    }

    // Get GTINs with style info (including product_type and flexible size columns)
    const gtins = await new Promise((resolve, reject) => {
      db.all(`
        SELECT g.*, s.style_number, s.product_name,
               (SELECT COUNT(*) FROM sgtins WHERE gtin_id = g.id) as sgtin_count
        FROM gtins g
        JOIN styles s ON g.style_id = s.id
        WHERE g.batch_id = ?
        ORDER BY s.style_number ASC, g.product_type ASC, g.size_value_1 ASC, g.size_value_2 ASC
      `, [batch.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Count unique styles in batch
    const styleCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(DISTINCT style_id) as count FROM gtins WHERE batch_id = ?', [batch.id], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });

    const gtinCount = gtins.length;
    const sgtinCount = gtins.reduce((sum, g) => sum + (g.sgtin_count || 0), 0);

    res.render('admin/batch-detail', {
      batch,
      gtins,
      styleCount,
      gtinCount,
      sgtinCount,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[batch-detail]', err);
    res.status(500).render('admin/hub-v2-error', { error: err.message });
  }
});

// GTIN detail page with overrides
router.get('/gtins/:gtinId', async (req, res) => {
  try {
    const gtin = await gtinRepository.getById(req.params.gtinId);
    if (!gtin) {
      return res.status(404).render('admin/hub-v2-error', { error: 'GTIN not found' });
    }

    const style = await styleRepository.getById(gtin.style_id);
    const batch = await batchRepository.getById(gtin.batch_id);
    const sgtins = await sgtinRepository.listByGtin(gtin.id);

    // Get all fields editable at GTIN level
    const allFields = (await fieldService.listFields()).filter(f => f.editable_at_gtin);
    const gtinValues = await fieldService.getEntityValues('gtin', gtin.id);

    // Load product type configuration
    const allProductTypes = ProductTypeConfig.listProductTypes().map(typeId => {
      return {
        id: typeId,
        ...ProductTypeConfig.getProductType(typeId)
      };
    });

    const currentProductType = gtin.product_type
      ? ProductTypeConfig.getProductType(gtin.product_type)
      : null;

    const sizeComponentTemplate = currentProductType
      ? ProductTypeConfig.getSizeComponentTemplate(gtin.product_type)
      : [];

    // Calculate display size
    const displaySize = ProductTypeConfig.getDisplaySize(gtin);

    res.render('admin/gtin-detail', {
      gtin,
      style,
      batch,
      sgtins,
      allFields,
      gtinValues,
      allProductTypes,
      currentProductType,
      sizeComponentTemplate,
      displaySize,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[gtin-detail]', err);
    res.status(500).render('admin/hub-v2-error', { error: err.message });
  }
});

// SGTIN detail page with inheritance
router.get('/sgtins/:sgtinId', async (req, res) => {
  try {
    const passportResolver = require('../../services/passport-resolver');
    const lifecycleService = require('../../services/lifecycle-service');
    const scanService = require('../../services/scan-service');
    const passport = await passportResolver.resolveSgtinPassport(req.params.sgtinId);

    // Get all fields editable at SGTIN level
    const allFields = (await fieldService.listFields()).filter(f => f.editable_at_sgtin);
    const sgtinValues = await fieldService.getEntityValues('sgtin', req.params.sgtinId);

    // Get lifecycle events
    const events = await lifecycleService.getEventsForPassport(req.params.sgtinId);

    // Get scan statistics
    const scanStats = await scanService.getScanStats(req.params.sgtinId);

    res.render('admin/sgtin-detail', {
      sgtin: passport.sgtin,
      gtin: passport.gtin,
      batch: passport.batch,
      style: passport.style,
      resolvedFields: passport.resolvedFields,
      allFields,
      sgtinValues,
      events,
      scanStats,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[sgtin-detail]', err);
    res.status(500).render('admin/hub-v2-error', { error: err.message });
  }
});

// Save GTIN DPP values
router.post('/gtins/:gtinId/dpp-values', async (req, res) => {
  try {
    const gtinId = req.params.gtinId;
    const values = req.body;

    for (const [fieldKey, value] of Object.entries(values)) {
      if (value) {
        await fieldService.setValue('gtin', gtinId, fieldKey, value);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[gtin-dpp-values]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save SGTIN DPP values
router.post('/sgtins/:sgtinId/dpp-values', async (req, res) => {
  try {
    const sgtinId = req.params.sgtinId;
    const values = req.body;

    for (const [fieldKey, value] of Object.entries(values)) {
      if (value) {
        await fieldService.setValue('sgtin', sgtinId, fieldKey, value);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[sgtin-dpp-values]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update batch
router.patch('/batches/:batchId', async (req, res) => {
  try {
    const { production_order, factory, production_date, country_of_production } = req.body;
    const batchId = req.params.batchId;

    await batchRepository.update(batchId, {
      production_order,
      factory,
      production_date,
      country_of_production
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[update-batch]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update field definition
router.patch('/fields/:fieldId', async (req, res) => {
  try {
    const { label, category } = req.body;
    const fieldId = req.params.fieldId;

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE field_definitions SET label = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [label, category, fieldId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[update-field]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update GTIN product type and size values
router.patch('/gtins/:gtinId/product-type', async (req, res) => {
  try {
    const gtinId = req.params.gtinId;
    const { product_type, item_number, size_value_1, size_value_2, size_value_3 } = req.body;

    // Validate product type if provided
    if (product_type) {
      const config = ProductTypeConfig.getProductType(product_type);
      if (!config) {
        return res.status(400).json({ success: false, error: 'Invalid product type' });
      }
    }

    await gtinRepository.update(gtinId, {
      product_type: product_type || null,
      item_number: item_number || null,
      size_value_1: size_value_1 || null,
      size_value_2: size_value_2 || null,
      size_value_3: size_value_3 || null
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[update-gtin-product-type]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
