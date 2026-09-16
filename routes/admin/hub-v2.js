/**
 * Admin Hub v2 - Refactored for new GTIN/Variant/Batch hierarchy
 *
 * Key changes:
 * - GTINs are masterdata (no batch_id)
 * - Variants are style product variations
 * - SGTINs link Batch × GTIN × Serial
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../../db/init-v2').db;
const batchGtinsRouter = require('./batch-gtins');
const fieldRepository = require('../../repositories/fields');
const variantRepository = require('../../repositories/variants');
const supplyChainRepository = require('../../repositories/supply-chain');
const economicOperatorRepository = require('../../repositories/economic-operators');
const batchStyleScopeRepository = require('../../repositories/batch-style-scopes');

// Image upload config for variants - mirrors routes/admin/styles.js's
// style image upload (found missing entirely for variants alongside
// the missing product_name/image_url columns)
const variantUploadDir = path.join(__dirname, '../../public/uploads/variants');
if (!fs.existsSync(variantUploadDir)) {
  fs.mkdirSync(variantUploadDir, { recursive: true });
}

const variantUpload = multer({
  storage: multer.diskStorage({
    destination: variantUploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `variant-${req.params.variantId}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});
const fieldService = require('../../services/field-service');
const passportVersionRepository = require('../../repositories/passport-versions');

// Turn getEntityValues() rows into a { field_key: value } lookup map
const buildValueMap = (rows) => Object.fromEntries(rows.map(r => [r.field_key, r.value]));

// ROADMAP.md Phase 2: default value merged with the requested locale's
// translation where one exists (locale wins) - same language-first
// principle as passport-resolver.js, applied to a single entity for
// the admin "inherited from X" comparison.
const buildLocaleAwareValueMap = async (entityType, entityId, locale) => {
  const defaultMap = buildValueMap(await fieldRepository.getEntityValues(entityType, entityId, null));
  if (!locale) return defaultMap;
  const localizedMap = buildValueMap(await fieldRepository.getEntityValues(entityType, entityId, locale));
  return { ...defaultMap, ...localizedMap };
};

const getOne = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const getAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows || []);
  });
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});

// Main hub
router.get('/', async (req, res) => {
  try {
    const tab = req.query.tab || 'styles';
    const user = { username: 'demo', role: 'admin' };
    let data = { tab, user };

    // STYLES TAB
    if (tab === 'styles') {
      data.styles = await getAll(`
        SELECT
          s.id,
          s.style_number,
          s.product_name,
          s.product_type,
          COUNT(DISTINCT g.id) as gtin_count,
          COUNT(DISTINCT v.id) as variant_count,
          COUNT(DISTINCT sg.id) as sgtin_count
        FROM styles s
        LEFT JOIN gtins g ON g.style_id = s.id
        LEFT JOIN variants v ON v.style_id = s.id
        LEFT JOIN sgtins sg ON sg.gtin_id = g.id
        GROUP BY s.id
        ORDER BY s.style_number DESC
      `);
    }

    // VARIANTS TAB
    else if (tab === 'variants') {
      const styleId = req.query.style;
      let query = `
        SELECT
          v.id,
          v.style_id,
          v.variant_name,
          s.style_number,
          s.product_name,
          COALESCE(v.product_name, s.product_name) AS effective_product_name,
          COUNT(DISTINCT g.id) as gtin_count,
          COUNT(DISTINCT sg.id) as sgtin_count
        FROM variants v
        JOIN styles s ON s.id = v.style_id
        LEFT JOIN gtins g ON g.variant_id = v.id
        LEFT JOIN sgtins sg ON sg.gtin_id = g.id
      `;
      const params = [];

      if (styleId) {
        query += ' WHERE v.style_id = ?';
        params.push(styleId);
      }

      query += ` GROUP BY v.id ORDER BY s.style_number, v.variant_name`;

      data.variants = await getAll(query, params);
      // Only styles that actually have variants - filtering by a
      // variant-less style (e.g. jeans) would always show zero rows
      data.styles = await getAll(`
        SELECT DISTINCT s.id, s.style_number, s.product_name
        FROM styles s
        JOIN variants v ON v.style_id = s.id
        ORDER BY s.style_number
      `);
      data.selectedStyleId = styleId;
    }

    // GTINS TAB (Masterdata)
    else if (tab === 'gtins') {
      const search = req.query.search || '';
      const styleId = req.query.style;
      const variantId = req.query.variant;

      let query = `
        SELECT
          g.id,
          g.gtin,
          g.item_number,
          g.product_type,
          g.size_value_1,
          g.size_value_2,
          g.size_value_3,
          g.style_id,
          s.style_number,
          COALESCE(v.product_name, s.product_name) AS product_name,
          v.id as variant_id,
          v.variant_name,
          COUNT(DISTINCT sg.id) as sgtin_count
        FROM gtins g
        JOIN styles s ON g.style_id = s.id
        LEFT JOIN variants v ON g.variant_id = v.id
        LEFT JOIN sgtins sg ON sg.gtin_id = g.id
      `;
      const params = [];
      const conditions = [];

      if (search) {
        // Match every column actually visible in the table (GTIN, SKU,
        // Style #, Name, Variant) - was only GTIN/SKU/Style #, so
        // searching for a product or variant name (both shown columns)
        // silently found nothing.
        conditions.push(`(
          g.gtin LIKE ? OR g.item_number LIKE ? OR s.style_number LIKE ?
          OR s.product_name LIKE ? OR v.product_name LIKE ? OR v.variant_name LIKE ?
        )`);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (styleId) {
        conditions.push(`g.style_id = ?`);
        params.push(styleId);
      }

      if (variantId) {
        conditions.push(`g.variant_id = ?`);
        params.push(variantId);
      }

      const whereClause = conditions.length > 0 ? ` WHERE ` + conditions.join(' AND ') : '';

      // Pagination - a single jeans style's full waist x length matrix
      // can already be dozens of GTINs; this list only grows as more
      // styles are added, so it needs a hard page size from the start
      // rather than rendering every matching row.
      const perPage = 50;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const totalRow = await getOne(`SELECT COUNT(DISTINCT g.id) as total FROM gtins g JOIN styles s ON g.style_id = s.id LEFT JOIN variants v ON g.variant_id = v.id${whereClause}`, params);
      const totalCount = totalRow.total;
      const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

      query += whereClause;
      query += ` GROUP BY g.id ORDER BY s.style_number, COALESCE(v.variant_name, ''), g.item_number`;
      query += ` LIMIT ? OFFSET ?`;

      data.gtins = await getAll(query, [...params, perPage, (page - 1) * perPage]);
      data.search = search;
      data.selectedStyleId = styleId;
      data.selectedVariantId = variantId;
      data.page = page;
      data.totalPages = totalPages;
      data.totalCount = totalCount;
      data.styles = await getAll(`SELECT id, style_number, product_name FROM styles ORDER BY style_number`);

      // Get variants for selected style
      if (styleId) {
        data.variants = await getAll(`SELECT id, variant_name FROM variants WHERE style_id = ? ORDER BY variant_name`, [styleId]);
      }
    }

    // BATCHES TAB
    else if (tab === 'batches') {
      const styleId = req.query.style;
      const search = req.query.search || '';
      let query = `
        SELECT DISTINCT
          b.id,
          b.batch_id,
          b.production_order,
          COUNT(DISTINCT sg.id) as sgtin_count,
          COUNT(DISTINCT g.id) as gtin_count,
          COUNT(DISTINCT s.id) as style_count
        FROM batches b
        LEFT JOIN sgtins sg ON sg.batch_id = b.id
        LEFT JOIN gtins g ON g.id = sg.gtin_id
        LEFT JOIN styles s ON s.id = g.style_id
      `;
      const params = [];
      const conditions = [];

      if (styleId) {
        conditions.push(`s.id = ?`);
        params.push(styleId);
      }

      if (search) {
        // Search the batch's OWN data (what the list actually shows),
        // not just the Style filter - a batch code or production order
        // typed in couldn't be found before.
        conditions.push(`(b.batch_id LIKE ? OR b.production_order LIKE ?)`);
        params.push(`%${search}%`, `%${search}%`);
      }

      if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
      }

      query += ` GROUP BY b.id ORDER BY b.batch_id DESC`;

      data.batches = await getAll(query, params);
      data.styles = await getAll(`SELECT id, style_number, product_name FROM styles ORDER BY style_number`);
      data.selectedStyleId = styleId;
      data.search = search;
    }

    // SGTINS TAB (Individual garments)
    else if (tab === 'sgtins') {
      const gtinId = req.query.gtin;
      let query = `
        SELECT
          sg.id,
          sg.serial_number,
          sg.sgtin,
          sg.qc_status,
          g.gtin,
          g.item_number,
          g.product_type,
          g.size_value_1,
          g.size_value_2,
          g.size_value_3,
          s.style_number,
          s.product_name,
          b.batch_id,
          v.variant_name,
          COUNT(DISTINCT le.id) as event_count
        FROM sgtins sg
        JOIN gtins g ON g.id = sg.gtin_id
        JOIN styles s ON s.id = g.style_id
        JOIN batches b ON b.id = sg.batch_id
        LEFT JOIN variants v ON v.id = g.variant_id
        LEFT JOIN lifecycle_events le ON le.sgtin_id = sg.id
      `;
      const params = [];

      if (gtinId) {
        query += ` WHERE sg.gtin_id = ?`;
        params.push(gtinId);
      }

      query += ` GROUP BY sg.id ORDER BY b.batch_id DESC, sg.serial_number ASC`;

      data.sgtins = await getAll(query, params);
    }

    // FIELDS TAB (DPP Field Definitions)
    else if (tab === 'fields') {
      const category = req.query.category || null;
      let query = 'SELECT * FROM field_definitions';
      const params = [];

      if (category) {
        query += ' WHERE category = ?';
        params.push(category);
      }

      query += ' ORDER BY category, sort_order, label';

      data.fields = await getAll(query, params);
      data.selectedCategory = category;
      data.categories = ['eu_required', 'nudie'];
    }

    // ANALYTICS TAB (Scan statistics)
    else if (tab === 'analytics') {
      data.totals = await getOne(`
        SELECT
          COUNT(*) as total_scans,
          COUNT(DISTINCT sgtin_id) as unique_sgtins_scanned,
          MIN(scan_timestamp) as first_scan,
          MAX(scan_timestamp) as last_scan
        FROM scan_events
      `);

      data.topProducts = await getAll(`
        SELECT
          s.style_number,
          s.product_name,
          g.gtin,
          COUNT(se.id) as scan_count
        FROM scan_events se
        JOIN sgtins sg ON sg.id = se.sgtin_id
        JOIN gtins g ON g.id = sg.gtin_id
        JOIN styles s ON s.id = g.style_id
        GROUP BY g.id
        ORDER BY scan_count DESC
        LIMIT 10
      `);

      data.recentScans = await getAll(`
        SELECT
          se.scan_timestamp,
          se.scan_method,
          se.scan_location,
          sg.serial_number,
          s.style_number,
          s.product_name,
          b.batch_id
        FROM scan_events se
        JOIN sgtins sg ON sg.id = se.sgtin_id
        JOIN gtins g ON g.id = sg.gtin_id
        JOIN styles s ON s.id = g.style_id
        JOIN batches b ON b.id = sg.batch_id
        ORDER BY se.scan_timestamp DESC
        LIMIT 25
      `);

      data.scansByDay = await getAll(`
        SELECT
          DATE(scan_timestamp) as day,
          COUNT(*) as scan_count
        FROM scan_events
        GROUP BY DATE(scan_timestamp)
        ORDER BY day DESC
        LIMIT 14
      `);
    }

    // ECONOMIC OPERATORS TAB (ROADMAP.md Phase 4)
    else if (tab === 'operators') {
      data.operators = await getAll(`
        SELECT eo.*,
          (SELECT COUNT(*) FROM styles WHERE operator_id = eo.id) as style_count,
          (SELECT COUNT(*) FROM batches WHERE operator_id = eo.id) as batch_count
        FROM economic_operators eo
        ORDER BY eo.legal_name ASC
      `);
    }

    res.render('admin/hub-v2', data);
  } catch (err) {
    console.error('[hub-v2]', err);
    res.status(500).render('admin/error', { error: err.message });
  }
});

// Style detail
router.get('/style/:styleId', async (req, res) => {
  try {
    const style = await getOne('SELECT * FROM styles WHERE id = ?', [req.params.styleId]);
    if (!style) return res.status(404).render('admin/error', { error: 'Style not found' });

    const variants = await getAll(
      'SELECT * FROM variants WHERE style_id = ? ORDER BY variant_name',
      [style.id]
    );

    const gtins = await getAll(`
      SELECT
        g.*,
        v.variant_name,
        COUNT(DISTINCT sg.id) as sgtin_count
      FROM gtins g
      LEFT JOIN variants v ON v.id = g.variant_id
      LEFT JOIN sgtins sg ON sg.gtin_id = g.id
      WHERE g.style_id = ?
      GROUP BY g.id
      ORDER BY COALESCE(v.variant_name, ''), g.item_number
    `, [style.id]);

    const batches = await getAll(`
      SELECT DISTINCT
        b.id,
        b.batch_id,
        COUNT(DISTINCT sg.id) as sgtin_count
      FROM batches b
      JOIN sgtins sg ON sg.batch_id = b.id
      JOIN gtins g ON g.id = sg.gtin_id
      WHERE g.style_id = ?
      GROUP BY b.id
      ORDER BY b.batch_id DESC
    `, [style.id]);

    // Calculate counts
    const gtinCount = gtins.length;
    const sgtinCount = gtins.reduce((sum, g) => sum + (g.sgtin_count || 0), 0);

    // Get DPP values for this style - LEFT JOIN so a field with no
    // value set anywhere yet still shows up as an empty, fillable row
    const locale = req.query.lang || null;
    const dppValues = await fieldRepository.getFieldsForLevel('style', style.id, locale);
    const availableLocales = await fieldRepository.getAvailableLocales('style', style.id);
    const supplyChainGroups = await supplyChainRepository.getGroupedForEntity('style', style.id);
    const operators = await economicOperatorRepository.list();

    res.render('admin/style-detail', {
      style,
      variants,
      gtins,
      batches,
      gtinCount,
      sgtinCount,
      dppValues,
      locale,
      availableLocales,
      supplyChainGroups,
      operators,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[style-detail]', err);
    res.status(500).render('admin/error', { error: err.message });
  }
});

// Supply chain: add a step for a style
router.post('/style/:styleId/supply-chain', async (req, res) => {
  try {
    const style = await getOne('SELECT * FROM styles WHERE id = ?', [req.params.styleId]);
    if (!style) return res.status(404).json({ success: false, error: 'Style not found' });

    const { step_category, step_label, sort_order, supplier_name, city, country, employee_range, visited_by_brand } = req.body;
    if (!step_category || !step_label) {
      return res.status(400).json({ success: false, error: 'step_category and step_label are required' });
    }

    const id = await supplyChainRepository.create('style', style.id, {
      step_category, step_label, sort_order, supplier_name, city, country, employee_range, visited_by_brand
    });

    res.json({ success: true, id });
  } catch (err) {
    console.error('[supply-chain-create]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Supply chain: update a step
router.put('/supply-chain/:stepId', async (req, res) => {
  try {
    await supplyChainRepository.update(req.params.stepId, req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('[supply-chain-update]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Supply chain: delete a step
router.delete('/supply-chain/:stepId', async (req, res) => {
  try {
    await supplyChainRepository.delete(req.params.stepId);
    res.json({ success: true });
  } catch (err) {
    console.error('[supply-chain-delete]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Economic operators (ROADMAP.md Phase 4): CRUD + assignment to
// Style/Batch. Kept in hub-v2.js alongside the other admin CRUD
// routes rather than a separate file, same as supply-chain above.
router.post('/operators', async (req, res) => {
  try {
    const { role, legal_name, address, country, registration_number } = req.body;
    if (!role || !legal_name) {
      return res.status(400).json({ success: false, error: 'role and legal_name are required' });
    }
    const id = await economicOperatorRepository.create({ role, legal_name, address, country, registration_number });
    res.json({ success: true, id });
  } catch (err) {
    console.error('[operator-create]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/operators/:operatorId', async (req, res) => {
  try {
    await economicOperatorRepository.update(req.params.operatorId, req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('[operator-update]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/operators/:operatorId', async (req, res) => {
  try {
    await economicOperatorRepository.delete(req.params.operatorId);
    res.json({ success: true });
  } catch (err) {
    console.error('[operator-delete]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/style/:styleId/operator', async (req, res) => {
  try {
    await economicOperatorRepository.setForStyle(req.params.styleId, req.body.operator_id || null);
    res.json({ success: true });
  } catch (err) {
    console.error('[style-operator]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/batch/:batchId/operator', async (req, res) => {
  try {
    await economicOperatorRepository.setForBatch(req.params.batchId, req.body.operator_id || null);
    res.json({ success: true });
  } catch (err) {
    console.error('[batch-operator]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Variant detail
router.get('/variant/:variantId', async (req, res) => {
  try {
    const variant = await getOne('SELECT * FROM variants WHERE id = ?', [req.params.variantId]);
    if (!variant) return res.status(404).render('admin/error', { error: 'Variant not found' });

    const style = await getOne('SELECT * FROM styles WHERE id = ?', [variant.style_id]);

    const gtins = await getAll(`
      SELECT
        g.*,
        COUNT(DISTINCT sg.id) as sgtin_count
      FROM gtins g
      LEFT JOIN sgtins sg ON sg.gtin_id = g.id
      WHERE g.variant_id = ?
      GROUP BY g.id
      ORDER BY g.item_number
    `, [variant.id]);

    const gtinCount = gtins.length;
    const sgtinCount = gtins.reduce((sum, g) => sum + (g.sgtin_count || 0), 0);

    const batchCount = (await getOne(`
      SELECT COUNT(DISTINCT sg.batch_id) as count
      FROM sgtins sg
      JOIN gtins g ON g.id = sg.gtin_id
      WHERE g.variant_id = ?
    `, [variant.id])).count;

    // Variant has exactly one style_id, so "inherited from Style" is
    // well-defined here - same pattern as GTIN's own inheritance
    const locale = req.query.lang || null;
    const variantFields = await fieldRepository.getFieldsForLevel('variant', variant.id, locale);
    const styleValueMap = await buildLocaleAwareValueMap('style', style.id, locale);
    const dppValues = variantFields.map(f => ({
      ...f,
      inheritedValue: styleValueMap[f.field_key] || null,
      inheritedFrom: styleValueMap[f.field_key] ? 'Style' : null
    }));
    const availableLocales = await fieldRepository.getAvailableLocales('variant', variant.id);

    res.render('admin/variant-detail', {
      variant,
      style,
      gtins,
      gtinCount,
      sgtinCount,
      batchCount,
      dppValues,
      locale,
      availableLocales,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[variant-detail]', err);
    res.status(500).render('admin/error', { error: err.message });
  }
});

// Update variant info (name, and - per ROADMAP.md's variant
// architecture fix - its own product_name/image_url, since some
// product types like tops need these to differ per variant, not just
// per style)
router.patch('/variant/:variantId', async (req, res) => {
  try {
    const variant = await getOne('SELECT * FROM variants WHERE id = ?', [req.params.variantId]);
    if (!variant) return res.status(404).json({ success: false, error: 'Variant not found' });

    const { variant_name, product_name, image_url } = req.body;
    const updates = {};
    if (variant_name !== undefined) updates.variant_name = variant_name;
    if (product_name !== undefined) updates.product_name = product_name || null;
    if (image_url !== undefined) updates.image_url = image_url || null;

    await variantRepository.update(variant.id, updates);
    res.json({ success: true });
  } catch (err) {
    console.error('[variant-update]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload a variant's own image (mirrors POST /:styleId/image in
// routes/admin/styles.js) - the edit form previously only had a raw
// text input for image_url, no actual upload
router.post('/variant/:variantId/image', variantUpload.single('image'), async (req, res) => {
  try {
    const variant = await getOne('SELECT * FROM variants WHERE id = ?', [req.params.variantId]);
    if (!variant) return res.status(404).json({ success: false, error: 'Variant not found' });
    if (!req.file) return res.status(400).json({ success: false, error: 'No image file provided' });

    const imageUrl = `/uploads/variants/${req.file.filename}`;
    await variantRepository.update(variant.id, { image_url: imageUrl });

    res.json({ success: true, image_url: imageUrl });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error('[variant-image-upload]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a variant's own image (reverts to the style's image)
router.delete('/variant/:variantId/image', async (req, res) => {
  try {
    const variant = await getOne('SELECT * FROM variants WHERE id = ?', [req.params.variantId]);
    if (!variant) return res.status(404).json({ success: false, error: 'Variant not found' });
    if (!variant.image_url) return res.status(404).json({ success: false, error: 'No image to delete' });

    const filePath = path.join(__dirname, `../../public${variant.image_url}`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await variantRepository.update(variant.id, { image_url: null });
    res.json({ success: true });
  } catch (err) {
    console.error('[variant-image-delete]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save DPP field values at Variant level
router.post('/variant/:variantId/dpp-values', async (req, res) => {
  try {
    const variant = await getOne('SELECT * FROM variants WHERE id = ?', [req.params.variantId]);
    if (!variant) return res.status(404).json({ success: false, error: 'Variant not found' });

    const locale = req.query.lang || null;
    for (const [fieldKey, value] of Object.entries(req.body)) {
      if (value) {
        await fieldService.setValue('variant', variant.id, fieldKey, value, { locale });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[variant-dpp-values]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batch detail
router.get('/batch/:batchId', async (req, res) => {
  try {
    const batch = await getOne('SELECT * FROM batches WHERE id = ?', [req.params.batchId]);
    if (!batch) return res.status(404).render('admin/error', { error: 'Batch not found' });

    // Get planned GTINs for this batch with created SGTINs count
    const batchGtins = await getAll(`
      SELECT
        bg.id as batch_gtin_id,
        bg.planned_quantity,
        g.id as gtin_id,
        g.gtin,
        g.item_number,
        g.product_type,
        g.size_value_1,
        g.size_value_2,
        g.size_value_3,
        s.style_number,
        s.product_name,
        v.variant_name,
        COUNT(DISTINCT sg.id) as created_quantity
      FROM batch_gtins bg
      JOIN gtins g ON g.id = bg.gtin_id
      JOIN styles s ON s.id = g.style_id
      LEFT JOIN variants v ON v.id = g.variant_id
      LEFT JOIN sgtins sg ON sg.gtin_id = g.id AND sg.batch_id = ?
      WHERE bg.batch_id = ?
      GROUP BY bg.id
      ORDER BY s.style_number, COALESCE(v.variant_name, ''), g.item_number
    `, [batch.id, batch.id]);

    // Also get SGTINs (for detail view if needed)
    const sgtins = await getAll(`
      SELECT
        sg.*,
        g.gtin,
        g.item_number,
        g.product_type,
        g.size_value_1,
        g.size_value_2,
        g.size_value_3,
        s.style_number,
        s.product_name,
        v.variant_name
      FROM sgtins sg
      JOIN gtins g ON g.id = sg.gtin_id
      JOIN styles s ON s.id = g.style_id
      LEFT JOIN variants v ON v.id = g.variant_id
      WHERE sg.batch_id = ?
      ORDER BY s.style_number, COALESCE(v.variant_name, ''), sg.serial_number
    `, [batch.id]);

    // Get all styles for form dropdown
    const styles = await getAll(`
      SELECT
        s.id,
        s.style_number,
        s.product_name,
        s.product_type
      FROM styles s
      ORDER BY s.style_number
    `);

    // Get all GTINs with variants for form population
    const gtins = await getAll(`
      SELECT
        g.id,
        g.style_id,
        g.variant_id,
        g.gtin,
        g.item_number,
        g.product_type,
        g.size_value_1,
        g.size_value_2,
        g.size_value_3,
        s.style_number,
        s.product_name,
        v.variant_name
      FROM gtins g
      JOIN styles s ON s.id = g.style_id
      LEFT JOIN variants v ON v.id = g.variant_id
      ORDER BY s.style_number, COALESCE(v.variant_name, ''), g.item_number
    `);

    const gtin_count = batchGtins.length;
    const style_count = new Set(batchGtins.map(bg => bg.style_number)).size;
    const sgtin_count = sgtins.length;
    const planned_total = batchGtins.reduce((sum, bg) => sum + (bg.planned_quantity || 0), 0);

    // ROADMAP.md Phase 2: ?lang= edits/shows that language's values;
    // default (no ?lang=) is the base value used when no translation
    // exists. availableLocales drives the language tab bar.
    const locale = req.query.lang || null;

    // A Batch can span multiple Styles/Variants (CLAUDE.md's
    // PO45001234 example), so ?scopeStyle=/&scopeVariant= narrow the
    // DPP Field Values card to just one Style (or Style+Variant)
    // within this batch, mirroring the language-tab pattern. No
    // scope query param = the original whole-batch behavior.
    const scopeStyleId = req.query.scopeStyle ? parseInt(req.query.scopeStyle) : null;
    const scopeVariantId = req.query.scopeVariant ? parseInt(req.query.scopeVariant) : null;
    const scope = scopeStyleId ? await batchStyleScopeRepository.find(batch.id, scopeStyleId, scopeVariantId) : null;
    // -1 is a sentinel entity_id that can never match a real
    // dpp_values row - lets getFieldsForLevel return every
    // batch-editable field as "not set" before any scope row exists
    // yet, without creating one just to view the page.
    const scopeEntityId = scope ? scope.id : -1;

    const dppValues = scopeStyleId
      ? await fieldRepository.getFieldsForLevel('batch_style', scopeEntityId, locale)
      : await fieldRepository.getFieldsForLevel('batch', batch.id, locale);
    const availableLocales = scopeStyleId
      ? (scope ? await fieldRepository.getAvailableLocales('batch_style', scope.id) : [])
      : await fieldRepository.getAvailableLocales('batch', batch.id);
    const scopeCombos = await batchStyleScopeRepository.listCombosForBatch(batch.id);
    const operators = await economicOperatorRepository.list();

    res.render('admin/batch-detail', {
      batch,
      locale,
      availableLocales,
      batchGtins,
      sgtins,
      styles,
      gtins,
      gtin_count,
      style_count,
      sgtin_count,
      planned_total,
      dppValues,
      operators,
      scopeCombos,
      scopeStyleId,
      scopeVariantId,
      scope,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[batch-detail]', err);
    res.status(500).render('admin/error', { error: err.message });
  }
});

// Mark a batch as produced - locks it (ROADMAP.md Phase 1). From this
// point, further dpp_values writes on this batch or its SGTINs are kept
// in field_change_log rather than silently overwritten.
router.post('/batch/:batchId/mark-produced', async (req, res) => {
  try {
    const batch = await getOne('SELECT * FROM batches WHERE id = ?', [req.params.batchId]);
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    if (batch.produced_at) return res.status(409).json({ success: false, error: 'Batch is already marked as produced' });

    await run('UPDATE batches SET produced_at = CURRENT_TIMESTAMP WHERE id = ?', [batch.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[mark-produced]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save DPP field values at Batch level, or scoped to one Style/Variant
// within the batch via ?scopeStyle=/&scopeVariant= (see the GET route
// above). Unlike viewing, saving DOES create the batch_style_scopes
// row on demand (getOrCreate) - there's an actual value to attach it to.
router.post('/batch/:batchId/dpp-values', async (req, res) => {
  try {
    const batch = await getOne('SELECT * FROM batches WHERE id = ?', [req.params.batchId]);
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });

    const locale = req.query.lang || null;
    const scopeStyleId = req.query.scopeStyle ? parseInt(req.query.scopeStyle) : null;
    const scopeVariantId = req.query.scopeVariant ? parseInt(req.query.scopeVariant) : null;

    let entityType = 'batch';
    let entityId = batch.id;
    if (scopeStyleId) {
      const scope = await batchStyleScopeRepository.getOrCreate(batch.id, scopeStyleId, scopeVariantId);
      entityType = 'batch_style';
      entityId = scope.id;
    }

    for (const [fieldKey, value] of Object.entries(req.body)) {
      if (value) {
        await fieldService.setValue(entityType, entityId, fieldKey, value, { locale });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[batch-dpp-values]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GTIN detail (masterdata)
router.get('/gtin/:gtinId', async (req, res) => {
  try {
    const gtin = await getOne('SELECT * FROM gtins WHERE id = ?', [req.params.gtinId]);
    if (!gtin) return res.status(404).render('admin/error', { error: 'GTIN not found' });

    const style = await getOne('SELECT * FROM styles WHERE id = ?', [gtin.style_id]);
    const variant = gtin.variant_id ? await getOne('SELECT * FROM variants WHERE id = ?', [gtin.variant_id]) : null;

    const sgtins = await getAll(`
      SELECT
        sg.*,
        b.batch_id
      FROM sgtins sg
      JOIN batches b ON b.id = sg.batch_id
      WHERE sg.gtin_id = ?
      ORDER BY b.batch_id DESC, sg.serial_number ASC
    `, [gtin.id]);

    // GTIN has exactly one style_id (and optionally one variant_id), so
    // "inherited from Variant/Style" is well-defined here (unlike Batch,
    // which can span several styles)
    const locale = req.query.lang || null;
    const gtinFields = await fieldRepository.getFieldsForLevel('gtin', gtin.id, locale);
    const variantValueMap = variant ? await buildLocaleAwareValueMap('variant', variant.id, locale) : {};
    const styleValueMap = await buildLocaleAwareValueMap('style', style.id, locale);
    const dppValues = gtinFields.map(f => {
      const inheritedValue = variantValueMap[f.field_key] || styleValueMap[f.field_key] || null;
      const inheritedFrom = variantValueMap[f.field_key] ? 'Variant' : styleValueMap[f.field_key] ? 'Style' : null;
      return { ...f, inheritedValue, inheritedFrom };
    });
    const availableLocales = await fieldRepository.getAvailableLocales('gtin', gtin.id);

    res.render('admin/gtin-detail', {
      gtin,
      style,
      variant,
      sgtins,
      dppValues,
      locale,
      availableLocales,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[gtin-detail]', err);
    res.status(500).render('admin/error', { error: err.message });
  }
});

// Save DPP field values at GTIN level
router.post('/gtin/:gtinId/dpp-values', async (req, res) => {
  try {
    const gtin = await getOne('SELECT * FROM gtins WHERE id = ?', [req.params.gtinId]);
    if (!gtin) return res.status(404).json({ success: false, error: 'GTIN not found' });

    const locale = req.query.lang || null;
    for (const [fieldKey, value] of Object.entries(req.body)) {
      if (value) {
        await fieldService.setValue('gtin', gtin.id, fieldKey, value, { locale });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[gtin-dpp-values]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// SGTIN detail
router.get('/sgtin/:sgtinId', async (req, res) => {
  try {
    const sgtin = await getOne('SELECT * FROM sgtins WHERE id = ?', [req.params.sgtinId]);
    if (!sgtin) return res.status(404).render('admin/error', { error: 'SGTIN not found' });

    const gtin = await getOne('SELECT * FROM gtins WHERE id = ?', [sgtin.gtin_id]);
    const style = await getOne('SELECT * FROM styles WHERE id = ?', [gtin.style_id]);
    const variant = gtin.variant_id ? await getOne('SELECT * FROM variants WHERE id = ?', [gtin.variant_id]) : null;
    const batch = await getOne('SELECT * FROM batches WHERE id = ?', [sgtin.batch_id]);

    const events = await getAll('SELECT * FROM lifecycle_events WHERE sgtin_id = ? ORDER BY created_at DESC', [sgtin.id]);

    // An SGTIN has a fixed GTIN and Batch, so the full inheritance
    // chain (GTIN > Batch×Variant > Batch×Style > Batch > Variant >
    // Style) is well-defined here - same precedence passport-resolver.js
    // uses for the public passport
    const locale = req.query.lang || null;
    const sgtinFields = await fieldRepository.getFieldsForLevel('sgtin', sgtin.id, locale);
    const gtinValueMap = await buildLocaleAwareValueMap('gtin', gtin.id, locale);
    const batchVariantScope = variant ? await batchStyleScopeRepository.find(batch.id, style.id, variant.id) : null;
    const batchStyleScope = await batchStyleScopeRepository.find(batch.id, style.id, null);
    const batchVariantValueMap = batchVariantScope ? await buildLocaleAwareValueMap('batch_style', batchVariantScope.id, locale) : {};
    const batchStyleValueMap = batchStyleScope ? await buildLocaleAwareValueMap('batch_style', batchStyleScope.id, locale) : {};
    const batchValueMap = await buildLocaleAwareValueMap('batch', batch.id, locale);
    const variantValueMap = variant ? await buildLocaleAwareValueMap('variant', variant.id, locale) : {};
    const styleValueMap = await buildLocaleAwareValueMap('style', style.id, locale);
    const dppValues = sgtinFields.map(f => {
      const inheritedValue = gtinValueMap[f.field_key] || batchVariantValueMap[f.field_key] || batchStyleValueMap[f.field_key] || batchValueMap[f.field_key] || variantValueMap[f.field_key] || styleValueMap[f.field_key] || null;
      const inheritedFrom = gtinValueMap[f.field_key] ? 'GTIN'
        : batchVariantValueMap[f.field_key] ? 'Batch (this Variant)'
        : batchStyleValueMap[f.field_key] ? 'Batch (this Style)'
        : batchValueMap[f.field_key] ? 'Batch'
        : variantValueMap[f.field_key] ? 'Variant'
        : styleValueMap[f.field_key] ? 'Style' : null;
      return { ...f, inheritedValue, inheritedFrom };
    });
    const availableLocales = await fieldRepository.getAvailableLocales('sgtin', sgtin.id);

    const versionHistory = await passportVersionRepository.getHistory('sgtin', sgtin.id);

    res.render('admin/sgtin-detail', {
      sgtin,
      gtin,
      style,
      variant,
      batch,
      locale,
      availableLocales,
      events,
      dppValues,
      versionHistory,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[sgtin-detail]', err);
    res.status(500).render('admin/error', { error: err.message });
  }
});

// Save DPP field values at SGTIN level
router.post('/sgtin/:sgtinId/dpp-values', async (req, res) => {
  try {
    const sgtin = await getOne('SELECT * FROM sgtins WHERE id = ?', [req.params.sgtinId]);
    if (!sgtin) return res.status(404).json({ success: false, error: 'SGTIN not found' });

    const locale = req.query.lang || null;
    for (const [fieldKey, value] of Object.entries(req.body)) {
      if (value) {
        await fieldService.setValue('sgtin', sgtin.id, fieldKey, value, { locale });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[sgtin-dpp-values]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batch GTIN management API
router.use('/batch-gtins', batchGtinsRouter);

module.exports = router;
