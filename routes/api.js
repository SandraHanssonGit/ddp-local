const express = require('express');
const router = express.Router();
const { db, queries } = require('../db/init');

// Import batch + serials from partner
router.post('/batch/import', (req, res) => {
  const { batch_id, style_number, total_units, partner_name, serials } = req.body;

  // Insert batch
  db.run(
    `INSERT INTO batches (batch_id, style_number, total_units, partner_name) VALUES (?, ?, ?, ?)`,
    [batch_id, style_number, total_units, partner_name],
    function(err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      // Insert serials
      let inserted = 0;
      serials.forEach(serial_number => {
        db.run(
          `INSERT INTO serials (batch_id, serial_number) VALUES (?, ?)`,
          [batch_id, serial_number],
          function(err) {
            if (!err) {
              // Auto-set condition to "new" for new serials
              db.run(
                `INSERT INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
                [this.lastID, 'condition', 'new', 'system'],
                () => {
                  inserted++;
                  if (inserted === serials.length) {
                    res.json({
                      success: true,
                      batch_id,
                      serials_imported: serials.length
                    });
                  }
                }
              );
            } else {
              inserted++;
            }
          }
        );
      });
    }
  );
});

// Add data to serial
router.post('/serials/:serial_number/data', (req, res) => {
  const { serial_number } = req.params;
  const { key, value, added_by } = req.body;

  queries.getSerial(serial_number, (err, rows) => {
    if (err || !rows || rows.length === 0) {
      return res.status(404).json({ error: 'Serial not found' });
    }

    const serial_id = rows[0].id;
    queries.addSerialData(serial_id, key, value, added_by, function(err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      res.json({ success: true, serial_number, key, value });
    });
  });
});

// Add event (repair, recycling, etc)
router.post('/serials/:serial_number/event', (req, res) => {
  const { serial_number } = req.params;
  const { event_type, event_data } = req.body;

  queries.getSerial(serial_number, (err, rows) => {
    if (err || !rows || rows.length === 0) {
      return res.status(404).json({ error: 'Serial not found' });
    }

    const serial_id = rows[0].id;
    queries.addEvent(serial_id, event_type, event_data, function(err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      res.json({ success: true, serial_number, event_type });
    });
  });
});

// Save product information (style-level)
router.post('/styles/:style_number/product-info', (req, res) => {
  const { style_number } = req.params;
  const { product_name, description, care_instructions, delivery_returns, size_material_composition } = req.body;

  db.run(`
    INSERT INTO styles (style_number, product_name, description, care_instructions, delivery_returns, size_material_composition)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(style_number) DO UPDATE SET
      product_name = excluded.product_name,
      description = excluded.description,
      care_instructions = excluded.care_instructions,
      delivery_returns = excluded.delivery_returns,
      size_material_composition = excluded.size_material_composition,
      updated_at = CURRENT_TIMESTAMP
  `, [style_number, product_name, description, care_instructions, delivery_returns, size_material_composition], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, style_number });
  });
});

// Save transparency data
router.post('/styles/:style_number/transparency', (req, res) => {
  const { style_number } = req.params;
  const { suppliers_chain, certifications, environmental_data, social_data } = req.body;

  db.run(`
    INSERT INTO transparency_data (style_number, suppliers_chain, certifications, environmental_data, social_data)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(style_number) DO UPDATE SET
      suppliers_chain = excluded.suppliers_chain,
      certifications = excluded.certifications,
      environmental_data = excluded.environmental_data,
      social_data = excluded.social_data,
      updated_at = CURRENT_TIMESTAMP
  `, [style_number, JSON.stringify(suppliers_chain), JSON.stringify(certifications), JSON.stringify(environmental_data), JSON.stringify(social_data)], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, style_number });
  });
});

// Save Nudie values
router.post('/styles/:style_number/nudie-values', (req, res) => {
  const { style_number } = req.params;
  const { repair_info, trade_in_info, partner_links } = req.body;

  db.run(`
    INSERT INTO nudie_values (style_number, repair_info, trade_in_info, partner_links)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(style_number) DO UPDATE SET
      repair_info = excluded.repair_info,
      trade_in_info = excluded.trade_in_info,
      partner_links = excluded.partner_links,
      updated_at = CURRENT_TIMESTAMP
  `, [style_number, repair_info, trade_in_info, JSON.stringify(partner_links)], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, style_number });
  });
});

// Save storytelling
router.post('/styles/:style_number/storytelling', (req, res) => {
  const { style_number } = req.params;
  const { summary, content, links } = req.body;

  db.run(`
    INSERT INTO storytelling (style_number, summary, content, links)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(style_number) DO UPDATE SET
      summary = excluded.summary,
      content = excluded.content,
      links = excluded.links,
      updated_at = CURRENT_TIMESTAMP
  `, [style_number, summary, content, JSON.stringify(links)], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, style_number });
  });
});

// Search endpoint
router.get('/search', (req, res) => {
  const { q, type } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({ error: 'Search query required' });
  }

  const searchTerm = `%${q}%`;

  let query = '';
  let params = [];

  if (type === 'style') {
    query = `
      SELECT 'style' as result_type, s.style_number, s.product_name, NULL as batch_id, NULL as serial_number
      FROM styles s
      WHERE s.style_number LIKE ? OR s.product_name LIKE ?
      LIMIT 20
    `;
    params = [searchTerm, searchTerm];
  } else if (type === 'batch') {
    query = `
      SELECT 'batch' as result_type, b.style_number, NULL as product_name, b.batch_id, NULL as serial_number
      FROM batches b
      WHERE b.batch_id LIKE ? OR b.style_number LIKE ?
      LIMIT 20
    `;
    params = [searchTerm, searchTerm];
  } else if (type === 'sgtin') {
    query = `
      SELECT 'serial' as result_type, b.style_number, NULL as product_name, b.batch_id, s.serial_number
      FROM serials s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      WHERE s.sgtin_numeric LIKE ? OR s.sgtin_uri LIKE ? OR s.serial_number LIKE ?
      LIMIT 20
    `;
    params = [searchTerm, searchTerm, searchTerm];
  } else {
    // Generic search across all
    query = `
      SELECT 'style' as result_type, s.style_number, s.product_name, NULL as batch_id, NULL as serial_number
      FROM styles s
      WHERE s.style_number LIKE ? OR s.product_name LIKE ?
      UNION
      SELECT 'batch' as result_type, b.style_number, NULL as product_name, b.batch_id, NULL as serial_number
      FROM batches b
      WHERE b.batch_id LIKE ? OR b.style_number LIKE ?
      UNION
      SELECT 'serial' as result_type, b.style_number, NULL as product_name, b.batch_id, s.serial_number
      FROM serials s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      WHERE s.serial_number LIKE ? OR s.sgtin_numeric LIKE ? OR s.sgtin_uri LIKE ?
      LIMIT 30
    `;
    params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ results: rows || [] });
  });
});

// Get full DPP data for a style
router.get('/styles/:style_number/full-data', (req, res) => {
  const { style_number } = req.params;

  db.get(`SELECT * FROM styles WHERE style_number = ?`, [style_number], (err, style) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!style) return res.status(404).json({ error: 'Style not found' });

    db.all(`SELECT * FROM transparency_data WHERE style_number = ?`, [style_number], (err, transparency) => {
      db.all(`SELECT * FROM nudie_values WHERE style_number = ?`, [style_number], (err, nudieValues) => {
        db.all(`SELECT * FROM storytelling WHERE style_number = ?`, [style_number], (err, storytelling) => {
          db.all(`SELECT b.*, (SELECT COUNT(*) FROM serials WHERE batch_id = b.batch_id) as serial_count FROM batches b WHERE b.style_number = ?`, [style_number], (err, batches) => {
            let transData = null;
            if (transparency && transparency.length > 0) {
              const trans = transparency[0];
              if (typeof trans.suppliers_chain === 'string') {
                transData = {
                  suppliers_chain: JSON.parse(trans.suppliers_chain || '{}'),
                  certifications: JSON.parse(trans.certifications || '{}'),
                  environmental_data: JSON.parse(trans.environmental_data || '{}'),
                  social_data: JSON.parse(trans.social_data || '{}')
                };
              } else {
                transData = trans;
              }
            }

            let nudieData = null;
            if (nudieValues && nudieValues.length > 0) {
              const nudie = nudieValues[0];
              if (typeof nudie.partner_links === 'string') {
                nudieData = {
                  repair_info: nudie.repair_info,
                  trade_in_info: nudie.trade_in_info,
                  partner_links: JSON.parse(nudie.partner_links || '[]')
                };
              } else {
                nudieData = nudie;
              }
            }

            let storyData = null;
            if (storytelling && storytelling.length > 0) {
              const story = storytelling[0];
              if (typeof story.links === 'string') {
                storyData = {
                  summary: story.summary,
                  content: story.content,
                  links: JSON.parse(story.links || '[]')
                };
              } else {
                storyData = story;
              }
            }

            res.json({
              style: style,
              transparency_data: transData,
              nudie_values: nudieData,
              storytelling: storyData,
              batches: batches || []
            });
          });
        });
      });
    });
  });
});

// Save batch metadata
router.post('/batch/metadata', (req, res) => {
  const { batch_id, production_date, manufacturing_details } = req.body;

  db.run(`
    INSERT INTO batch_data (batch_id, key, value) VALUES (?, ?, ?)
  `, [batch_id, 'production_date', production_date], (err) => {
    if (err) return res.status(400).json({ error: err.message });
  });

  db.run(`
    INSERT INTO batch_data (batch_id, key, value) VALUES (?, ?, ?)
  `, [batch_id, 'manufacturing_details', manufacturing_details], (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

// Get full DPP data for a batch (with all serials)
router.get('/batches/:batch_id/full-data', (req, res) => {
  const { batch_id } = req.params;

  db.get(`SELECT * FROM batches WHERE batch_id = ?`, [batch_id], (err, batch) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    db.all(`SELECT * FROM serials WHERE batch_id = ?`, [batch_id], (err, serials) => {
      const styleNumber = batch.style_number;

      db.get(`SELECT * FROM styles WHERE style_number = ?`, [styleNumber], (err, style) => {
        db.all(`SELECT * FROM transparency_data WHERE style_number = ?`, [styleNumber], (err, transparency) => {
          let transData = null;
          if (transparency && transparency.length > 0) {
            const trans = transparency[0];
            if (typeof trans.suppliers_chain === 'string') {
              transData = {
                suppliers_chain: JSON.parse(trans.suppliers_chain || '{}'),
                certifications: JSON.parse(trans.certifications || '{}'),
                environmental_data: JSON.parse(trans.environmental_data || '{}'),
                social_data: JSON.parse(trans.social_data || '{}')
              };
            } else {
              transData = trans;
            }
          }

          // Get all serial data for all serials in this batch
          db.all(`
            SELECT sd.* FROM serial_data sd
            WHERE sd.serial_id IN (SELECT id FROM serials WHERE batch_id = ?)
          `, [batch_id], (err, allSerialData) => {
            res.json({
              batch: batch,
              style: style || null,
              transparency_data: transData,
              serials: serials || [],
              serial_data: allSerialData || []
            });
          });
        });
      });
    });
  });
});

// Get full DPP data for a serial
router.get('/serials/:serial_number/full-data', (req, res) => {
  const { serial_number } = req.params;

  db.get(`SELECT * FROM serials WHERE serial_number = ?`, [serial_number], (err, serial) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!serial) return res.status(404).json({ error: 'Serial not found' });

    db.get(`SELECT * FROM batches WHERE batch_id = ?`, [serial.batch_id], (err, batch) => {
      const styleNumber = batch ? batch.style_number : null;

      db.get(`SELECT * FROM styles WHERE style_number = ?`, [styleNumber], (err, style) => {
        db.all(`SELECT * FROM serial_data WHERE serial_id = ?`, [serial.id], (err, serialData) => {
          db.all(`SELECT * FROM events WHERE serial_id = ?`, [serial.id], (err, events) => {
            res.json({
              serial: serial,
              batch: batch || null,
              style: style || null,
              serial_data: serialData || [],
              events: events || []
            });
          });
        });
      });
    });
  });
});

// Get style images
router.get('/styles/:style_number/images', (req, res) => {
  const { style_number } = req.params;
  db.all(`SELECT id, image_name FROM style_images WHERE style_number = ? ORDER BY created_at DESC`, [style_number], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows || []);
  });
});

// Upload style image
router.post('/styles/:style_number/image', (req, res) => {
  const { style_number } = req.params;
  const { image_data, image_name } = req.body;

  db.run(`INSERT INTO style_images (style_number, image_data, image_name) VALUES (?, ?, ?)`,
    [style_number, image_data, image_name], function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    });
});

// Delete style image
router.delete('/styles/image/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM style_images WHERE id = ?`, [id], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

// Get batch images
router.get('/batches/:batch_id/images', (req, res) => {
  const { batch_id } = req.params;
  db.all(`SELECT id, image_name FROM batch_images WHERE batch_id = ? ORDER BY created_at DESC`, [batch_id], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows || []);
  });
});

// Upload batch image
router.post('/batches/:batch_id/image', (req, res) => {
  const { batch_id } = req.params;
  const { image_data, image_name } = req.body;

  db.run(`INSERT INTO batch_images (batch_id, image_data, image_name) VALUES (?, ?, ?)`,
    [batch_id, image_data, image_name], function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    });
});

// Delete batch image
router.delete('/batches/image/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM batch_images WHERE id = ?`, [id], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

// Import supplier data (SGTIN, RFID) - paste format
router.post('/serials/import-supplier-data', (req, res) => {
  const { batch_id, data } = req.body;

  if (!data || typeof data !== 'string') {
    return res.status(400).json({ error: 'Data must be a string (paste format)' });
  }

  const lines = data.trim().split('\n').filter(l => l.trim());
  let processed = 0;
  let failed = [];

  lines.forEach((line, idx) => {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 2) {
      failed.push(`Line ${idx + 1}: Invalid format`);
      return;
    }

    const [serial_number, sgtin_numeric, sgtin_uri, rfid] = parts;

    db.run(`
      UPDATE serials
      SET sgtin_numeric = ?, sgtin_uri = ?, rfid = ?
      WHERE serial_number = ? AND batch_id = ?
    `, [sgtin_numeric || null, sgtin_uri || null, rfid || null, serial_number, batch_id], function(err) {
      if (err) {
        failed.push(`${serial_number}: ${err.message}`);
      } else if (this.changes === 0) {
        failed.push(`${serial_number}: Not found in batch`);
      }
      processed++;

      if (processed === lines.length) {
        res.json({
          success: true,
          processed: processed - failed.length,
          failed: failed.length,
          errors: failed.length > 0 ? failed : undefined
        });
      }
    });
  });

  if (lines.length === 0) {
    res.status(400).json({ error: 'No valid data to import' });
  }
});

module.exports = router;
