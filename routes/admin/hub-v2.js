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
const db = require('../../db/init-v2').db;
const batchGtinsRouter = require('./batch-gtins');

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
      data.styles = await getAll(`SELECT id, style_number, product_name FROM styles ORDER BY style_number`);
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
          s.product_name,
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
        conditions.push(`(g.gtin LIKE ? OR g.item_number LIKE ? OR s.style_number LIKE ?)`);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (styleId) {
        conditions.push(`g.style_id = ?`);
        params.push(styleId);
      }

      if (variantId) {
        conditions.push(`g.variant_id = ?`);
        params.push(variantId);
      }

      if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
      }

      query += ` GROUP BY g.id ORDER BY s.style_number, COALESCE(v.variant_name, ''), g.item_number`;

      data.gtins = await getAll(query, params);
      data.search = search;
      data.selectedStyleId = styleId;
      data.selectedVariantId = variantId;
      data.styles = await getAll(`SELECT id, style_number, product_name FROM styles ORDER BY style_number`);

      // Get variants for selected style
      if (styleId) {
        data.variants = await getAll(`SELECT id, variant_name FROM variants WHERE style_id = ? ORDER BY variant_name`, [styleId]);
      }
    }

    // BATCHES TAB
    else if (tab === 'batches') {
      const styleId = req.query.style;
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

      if (styleId) {
        query += ` WHERE s.id = ?`;
        params.push(styleId);
      }

      query += ` GROUP BY b.id ORDER BY b.batch_id DESC`;

      data.batches = await getAll(query, params);
      data.styles = await getAll(`SELECT id, style_number, product_name FROM styles ORDER BY style_number`);
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

    // Get DPP values for this style
    const dppValues = await getAll(`
      SELECT
        dv.value,
        fd.field_key,
        fd.label,
        fd.category
      FROM dpp_values dv
      JOIN field_definitions fd ON dv.field_definition_id = fd.id
      WHERE dv.entity_type = 'style' AND dv.entity_id = ?
      ORDER BY fd.category, fd.label
    `, [style.id]);

    res.render('admin/style-detail', {
      style,
      variants,
      gtins,
      batches,
      gtinCount,
      sgtinCount,
      dppValues,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[style-detail]', err);
    res.status(500).render('admin/error', { error: err.message });
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

    res.render('admin/variant-detail', {
      variant,
      style,
      gtins,
      gtinCount,
      sgtinCount,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[variant-detail]', err);
    res.status(500).render('admin/error', { error: err.message });
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

    res.render('admin/batch-detail', {
      batch,
      batchGtins,
      sgtins,
      styles,
      gtins,
      gtin_count,
      style_count,
      sgtin_count,
      planned_total,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[batch-detail]', err);
    res.status(500).render('admin/error', { error: err.message });
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

    res.render('admin/gtin-detail', {
      gtin,
      style,
      variant,
      sgtins,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[gtin-detail]', err);
    res.status(500).render('admin/error', { error: err.message });
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

    res.render('admin/sgtin-detail', {
      sgtin,
      gtin,
      style,
      variant,
      batch,
      events,
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[sgtin-detail]', err);
    res.status(500).render('admin/error', { error: err.message });
  }
});

// Batch GTIN management API
router.use('/batch-gtins', batchGtinsRouter);

module.exports = router;
