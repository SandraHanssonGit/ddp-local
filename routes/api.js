const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cheerio = require('cheerio');
const https = require('https');
const { db, queries } = require('../db/init');

const JWT_SECRET = process.env.JWT_SECRET;

// Input validation middleware
const validateSerialNumber = (req, res, next) => {
  const { serial_number } = req.params;
  if (!serial_number || typeof serial_number !== 'string' || serial_number.length > 100) {
    return res.status(400).json({ error: 'Invalid serial number' });
  }
  next();
};

const validateStyleNumber = (req, res, next) => {
  const { style_number } = req.params;
  if (!style_number || typeof style_number !== 'string' || style_number.length > 50) {
    return res.status(400).json({ error: 'Invalid style number' });
  }
  next();
};

const validateBatchId = (req, res, next) => {
  const { batch_id } = req.params;
  if (!batch_id || typeof batch_id !== 'string' || batch_id.length > 100) {
    return res.status(400).json({ error: 'Invalid batch ID' });
  }
  next();
};

const validateImageUpload = (req, res, next) => {
  if (req.body.image_data) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (req.body.image_data.length > maxSize * 1.33) { // base64 overhead
      return res.status(413).json({ error: 'Image too large (max 5MB)' });
    }
  }
  next();
};

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check role
const checkRole = (allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    // Verify password with bcrypt
    let isValid = false;
    try {
      isValid = await bcrypt.compare(password, user.password);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    // API clients cannot use UI
    if (user.role === 'api_client') {
      return res.status(403).json({ error: 'API clients cannot access UI. Use API directly.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
      success: true,
      token, // Also return token in response for localStorage backup
      user: { id: user.id, username: user.username, role: user.role }
    });
  });
});

// Add serials to existing batch
router.post('/serials/add', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { batch_id, serials } = req.body;

  if (!serials || serials.length === 0) {
    return res.status(400).json({ error: 'No serials provided' });
  }

  let inserted = 0;
  serials.forEach(serial_number => {
    db.run(
      `INSERT INTO serials (batch_id, serial_number, variant) VALUES (?, ?, NULL)`,
      [batch_id, serial_number],
      function(err) {
        if (!err) {
          db.run(
            `INSERT INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
            [this.lastID, 'condition', 'new', 'system'],
            () => {
              inserted++;
              if (inserted === serials.length) {
                res.json({ success: true, batch_id, serials_added: serials.length });
              }
            }
          );
        } else {
          inserted++;
          if (inserted === serials.length) {
            res.json({ success: true, batch_id, serials_added: inserted });
          }
        }
      }
    );
  });
});

// Import batch + serials from partner (creates new or adds serials to existing)
// Now: batch is generic container, style_number specified per serial
router.post('/batch/import', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { batch_id, total_units, partner_name, serials } = req.body;
  // serials format: [{ serial_number, style_number }, ...]

  // Check if batch exists
  db.get(`SELECT * FROM batches WHERE batch_id = ?`, [batch_id], (err, existingBatch) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    // If batch doesn't exist, create it
    if (!existingBatch) {
      return db.run(
        `INSERT INTO batches (batch_id, total_units, partner_name) VALUES (?, ?, ?)`,
        [batch_id, total_units, partner_name],
        function(err) {
          if (err) {
            return res.status(400).json({ error: err.message });
          }
          insertSerials();
        }
      );
    }

    // Batch exists, just add serials
    insertSerials();

    function insertSerials() {

      // Insert serials
      let inserted = 0;
      serials.forEach(serial => {
        const { serial_number, style_number, variant } = serial;
        if (!style_number) {
          inserted++;
          return; // Skip if no style_number
        }
        db.run(
          `INSERT INTO serials (batch_id, style_number, variant, serial_number) VALUES (?, ?, ?, ?)`,
          [batch_id, style_number, variant || null, serial_number],
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
  });
});

// Add data to serial
router.post('/serials/:serial_number/data', validateSerialNumber, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
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
router.post('/serials/:serial_number/event', validateSerialNumber, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
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

// Update event
router.put('/serials/:serial_number/event/:event_id', validateSerialNumber, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { serial_number, event_id } = req.params;
  const { event_type, event_data } = req.body;

  const eventDataStr = typeof event_data === 'string' ? event_data : JSON.stringify(event_data);

  db.run(`UPDATE events SET event_type = ?, event_data = ? WHERE id = ?`,
    [event_type, eventDataStr, event_id],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true, message: 'Event updated' });
    });
});

// Delete event
router.delete('/serials/:serial_number/event/:event_id', validateSerialNumber, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { serial_number, event_id } = req.params;

  db.run(`DELETE FROM events WHERE id = ?`, [event_id], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, message: 'Event deleted' });
  });
});

// Scrape Nudie Jeans product page
router.post('/styles/scrape-url', verifyToken, checkRole(['editor', 'admin', 'super_admin']), async (req, res) => {
  const { url } = req.body;

  if (!url || !url.includes('nudiejeans.com')) {
    return res.status(400).json({ error: 'Invalid Nudie Jeans URL' });
  }

  try {
    const html = await new Promise((resolve, reject) => {
      https.get(url, (response) => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => resolve(data));
      }).on('error', reject);
    });

    const $ = cheerio.load(html);

    // Extract product information
    const productName = $('h1').first().text().trim() ||
                       $('meta[property="og:title"]').attr('content')?.split('|')[0]?.trim();

    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content');

    res.json({
      product_name: productName || '',
      description: description || ''
    });
  } catch (err) {
    console.error('Scrape error:', err);
    res.status(500).json({ error: 'Failed to fetch URL' });
  }
});

// Save product information (style-level)
router.post('/styles/:style_number/product-info', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;

  // Validate style_number
  if (!style_number || typeof style_number !== 'string' || style_number.length === 0 || style_number.length > 50) {
    return res.status(400).json({ error: 'Invalid style number' });
  }
  const { product_type, variant, product_name, description, care_instructions, delivery_returns, size_material_composition } = req.body;
  const normalizedProductType = String(product_type || 'jeans').trim().toLowerCase();
  const trimmedVariant = typeof variant === 'string' ? variant.trim() : '';
  const normalizedVariant = normalizedProductType === 'topp' ? trimmedVariant.toUpperCase() : null;

  if (normalizedProductType === 'topp' && !normalizedVariant) {
    return res.status(400).json({ error: 'Variant is required when product type is topp' });
  }

  if (normalizedProductType === 'topp' && !/^[A-Z0-9-]+$/.test(normalizedVariant)) {
    return res.status(400).json({ error: 'Variant must only contain letters, numbers or dashes' });
  }

  db.run(`
    INSERT INTO styles (style_number, variant, product_type, product_name, description, care_instructions, delivery_returns, size_material_composition)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(style_number, variant) DO UPDATE SET
      product_type = excluded.product_type,
      product_name = excluded.product_name,
      description = excluded.description,
      care_instructions = excluded.care_instructions,
      delivery_returns = excluded.delivery_returns,
      size_material_composition = excluded.size_material_composition,
      updated_at = CURRENT_TIMESTAMP
  `, [style_number, normalizedVariant, normalizedProductType, product_name, description, care_instructions, delivery_returns, size_material_composition], function(err) {
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'This variant already exists for this style' });
      }
      return res.status(400).json({ error: err.message });
    }
    res.json({ success: true, style_number, variant: normalizedVariant });
  });
});

// Save transparency data
router.post('/styles/:style_number/transparency', validateStyleNumber, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  const { variant, suppliers_chain, certifications, environmental_data, social_data } = req.body;

  db.run(`
    INSERT INTO transparency_data (style_number, variant, suppliers_chain, certifications, environmental_data, social_data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(style_number, variant) DO UPDATE SET
      suppliers_chain = excluded.suppliers_chain,
      certifications = excluded.certifications,
      environmental_data = excluded.environmental_data,
      social_data = excluded.social_data,
      updated_at = CURRENT_TIMESTAMP
  `, [style_number, variant || null, JSON.stringify(suppliers_chain), JSON.stringify(certifications), JSON.stringify(environmental_data), JSON.stringify(social_data)], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, style_number, variant: variant || null });
  });
});

// Save Nudie values
router.post('/styles/:style_number/nudie-values', validateStyleNumber, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  const { variant, repair_info, trade_in_info, partner_links } = req.body;

  db.run(`
    INSERT INTO nudie_values (style_number, variant, repair_info, trade_in_info, partner_links)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(style_number, variant) DO UPDATE SET
      repair_info = excluded.repair_info,
      trade_in_info = excluded.trade_in_info,
      partner_links = excluded.partner_links,
      updated_at = CURRENT_TIMESTAMP
  `, [style_number, variant || null, repair_info, trade_in_info, JSON.stringify(partner_links)], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, style_number, variant: variant || null });
  });
});

// Save storytelling
router.post('/styles/:style_number/storytelling', validateStyleNumber, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  const { variant, summary, content, links } = req.body;

  db.run(`
    INSERT INTO storytelling (style_number, variant, summary, content, links)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(style_number, variant) DO UPDATE SET
      summary = excluded.summary,
      content = excluded.content,
      links = excluded.links,
      updated_at = CURRENT_TIMESTAMP
  `, [style_number, variant || null, summary, content, JSON.stringify(links)], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, style_number, variant: variant || null });
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
      SELECT 'style' as result_type, s.style_number, s.variant, s.product_type, s.product_name, NULL as batch_id, NULL as serial_number
      FROM styles s
      WHERE s.style_number LIKE ? OR s.product_name LIKE ?
      LIMIT 20
    `;
    params = [searchTerm, searchTerm];
  } else if (type === 'batch') {
    query = `
      SELECT 'batch' as result_type, NULL as style_number, NULL as product_name, b.batch_id, NULL as serial_number
      FROM batches b
      WHERE b.batch_id LIKE ?
      LIMIT 20
    `;
    params = [searchTerm];
  } else if (type === 'sgtin') {
    query = `
      SELECT 'serial' as result_type, s.style_number, NULL as product_name, b.batch_id, s.serial_number
      FROM serials s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      WHERE s.sgtin_numeric LIKE ? OR s.sgtin_uri LIKE ? OR s.serial_number LIKE ?
      LIMIT 20
    `;
    params = [searchTerm, searchTerm, searchTerm];
  } else {
    // Generic search across all
    query = `
      SELECT 'style' as result_type, s.style_number, s.variant, s.product_type, s.product_name, NULL as batch_id, NULL as serial_number
      FROM styles s
      WHERE s.style_number LIKE ? OR s.product_name LIKE ?
      UNION
      SELECT 'batch' as result_type, NULL as style_number, NULL as variant, NULL as product_type, NULL as product_name, b.batch_id, NULL as serial_number
      FROM batches b
      WHERE b.batch_id LIKE ?
      UNION
      SELECT 'serial' as result_type, s.style_number, NULL as variant, NULL as product_type, NULL as product_name, b.batch_id, s.serial_number
      FROM serials s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      WHERE s.serial_number LIKE ? OR s.sgtin_numeric LIKE ? OR s.sgtin_uri LIKE ?
      LIMIT 30
    `;
    params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ results: rows || [] });
  });
});

// Get all variants for a style
router.get('/styles/:style_number/variants', (req, res) => {
  const { style_number } = req.params;

  db.all(`SELECT DISTINCT variant FROM styles WHERE style_number = ?`, [style_number], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    const variants = rows ? rows.map(r => r.variant).filter(v => v !== null) : [];
    res.json({ variants });
  });
});

// Get full DPP data for a style (with variant support)
router.get('/styles/:style_number/full-data', (req, res) => {
  const { style_number } = req.params;
  const { variant } = req.query;
  const normalizedVariant = variant && variant !== '' ? variant : null;

  const whereVariant = normalizedVariant ? 'AND variant = ?' : 'AND variant IS NULL';
  const variantParam = normalizedVariant || null;

  db.get(`SELECT * FROM styles WHERE style_number = ? ${whereVariant}`, [style_number, ...(normalizedVariant ? [normalizedVariant] : [])], (err, style) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!style) return res.status(404).json({ error: 'Style not found' });

    db.all(`SELECT * FROM transparency_data WHERE style_number = ? ${whereVariant}`, [style_number, ...(normalizedVariant ? [normalizedVariant] : [])], (err, transparency) => {
      db.all(`SELECT * FROM nudie_values WHERE style_number = ? ${whereVariant}`, [style_number, ...(normalizedVariant ? [normalizedVariant] : [])], (err, nudieValues) => {
        db.all(`SELECT * FROM storytelling WHERE style_number = ? ${whereVariant}`, [style_number, ...(normalizedVariant ? [normalizedVariant] : [])], (err, storytelling) => {
          const whereVariantBatch = normalizedVariant ? 'AND s.variant = ?' : 'AND s.variant IS NULL';
          db.all(`SELECT DISTINCT b.*, (SELECT COUNT(*) FROM serials WHERE batch_id = b.batch_id AND style_number = ? ${whereVariantBatch}) as serial_count FROM batches b INNER JOIN serials s ON b.batch_id = s.batch_id WHERE s.style_number = ? ${whereVariantBatch}`, [style_number, ...(normalizedVariant ? [normalizedVariant] : []), style_number, ...(normalizedVariant ? [normalizedVariant] : [])], (err, batches) => {
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
router.post('/batch/metadata', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
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
      // style_number is on serials table now, not batches
      db.get(`SELECT * FROM styles WHERE style_number = ?`, [serial.style_number], (err, style) => {
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
  db.all(`SELECT id, image_name, image_data FROM style_images WHERE style_number = ? ORDER BY created_at DESC`, [style_number], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows || []);
  });
});

// Upload style image
router.post('/styles/:style_number/image', validateStyleNumber, validateImageUpload, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  const { image_data, image_name } = req.body;

  if (!image_data) {
    return res.status(400).json({ error: 'image_data required' });
  }

  db.run(`INSERT INTO style_images (style_number, image_data, image_name) VALUES (?, ?, ?)`,
    [style_number, image_data, image_name], function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    });
});

// Delete style image
router.delete('/styles/image/:id', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM style_images WHERE id = ?`, [id], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

// Get batch images
router.get('/batches/:batch_id/images', (req, res) => {
  const { batch_id } = req.params;
  db.all(`SELECT id, image_name, image_data FROM batch_images WHERE batch_id = ? ORDER BY created_at DESC`, [batch_id], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows || []);
  });
});

// Upload batch image
router.post('/batches/:batch_id/image', validateBatchId, validateImageUpload, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { batch_id } = req.params;
  const { image_data, image_name } = req.body;

  if (!image_data) {
    return res.status(400).json({ error: 'image_data required' });
  }

  db.run(`INSERT INTO batch_images (batch_id, image_data, image_name) VALUES (?, ?, ?)`,
    [batch_id, image_data, image_name], function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    });
});

// Delete batch image
router.delete('/batches/image/:id', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM batch_images WHERE id = ?`, [id], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

// Import supplier data (SGTIN, RFID) - paste format
router.post('/serials/import-supplier-data', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
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

// Delete endpoints (soft delete) - Requires admin or editor
router.post('/styles/:style_number/delete', verifyToken, checkRole(['admin', 'editor', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  db.run(`UPDATE styles SET deleted_at = CURRENT_TIMESTAMP WHERE style_number = ?`, [style_number], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, message: 'Style deleted' });
  });
});

router.post('/batches/:batch_id/delete', verifyToken, checkRole(['admin', 'editor', 'super_admin']), (req, res) => {
  const { batch_id } = req.params;
  db.run(`UPDATE batches SET deleted_at = CURRENT_TIMESTAMP WHERE batch_id = ?`, [batch_id], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, message: 'Batch deleted' });
  });
});

router.post('/serials/:serial_number/delete', verifyToken, checkRole(['admin', 'editor', 'super_admin']), (req, res) => {
  const { serial_number } = req.params;
  db.run(`UPDATE serials SET deleted_at = CURRENT_TIMESTAMP WHERE serial_number = ?`, [serial_number], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, message: 'Serial deleted' });
  });
});

// Permanent delete (Super Admin only)
router.post('/styles/:style_number/permanent-delete', verifyToken, checkRole(['super_admin']), (req, res) => {
  const { style_number } = req.params;
  db.run(`DELETE FROM styles WHERE style_number = ?`, [style_number], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, message: 'Style permanently deleted' });
  });
});

router.post('/batches/:batch_id/permanent-delete', verifyToken, checkRole(['super_admin']), (req, res) => {
  const { batch_id } = req.params;
  db.run(`DELETE FROM batches WHERE batch_id = ?`, [batch_id], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, message: 'Batch permanently deleted' });
  });
});

router.post('/serials/:serial_number/permanent-delete', verifyToken, checkRole(['super_admin']), (req, res) => {
  const { serial_number } = req.params;
  db.run(`DELETE FROM serials WHERE serial_number = ?`, [serial_number], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, message: 'Serial permanently deleted' });
  });
});

// Copy batch (duplicate batch with metadata and images, serials must be added separately)
router.post('/batch/copy', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { source_batch_id, new_batch_id } = req.body;

  db.get(`SELECT * FROM batches WHERE batch_id = ?`, [source_batch_id], (err, sourceBatch) => {
    if (err || !sourceBatch) {
      return res.status(404).json({ error: 'Source batch not found' });
    }

    // Create new batch
    db.run(`INSERT INTO batches (batch_id, total_units, partner_name) VALUES (?, ?, ?)`,
      [new_batch_id, sourceBatch.total_units, sourceBatch.partner_name],
      function(err) {
        if (err) return res.status(400).json({ error: err.message });

        // Copy batch_data (production_date, manufacturing_details)
        db.all(`SELECT key, value FROM batch_data WHERE batch_id = ?`, [source_batch_id], (err, batchData) => {
          (batchData || []).forEach(row => {
            db.run(`INSERT INTO batch_data (batch_id, key, value) VALUES (?, ?, ?)`,
              [new_batch_id, row.key, row.value]);
          });
        });

        // Copy batch images
        db.all(`SELECT image_data, image_name FROM batch_images WHERE batch_id = ?`, [source_batch_id], (err, images) => {
          (images || []).forEach(img => {
            db.run(`INSERT INTO batch_images (batch_id, image_data, image_name) VALUES (?, ?, ?)`,
              [new_batch_id, img.image_data, img.image_name]);
          });
        });

        res.json({ success: true, new_batch_id, message: 'Batch copied. Add serials separately.' });
      });
  });
});

// Dashboard endpoints
router.get('/styles', (req, res) => {
  db.all(`SELECT * FROM styles WHERE deleted_at IS NULL`, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows || []);
  });
});

router.get('/batches', (req, res) => {
  db.all(`SELECT * FROM batches WHERE deleted_at IS NULL`, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows || []);
  });
});

router.get('/serials', (req, res) => {
  db.all(`
    SELECT s.*, sd.key, sd.value
    FROM serials s
    LEFT JOIN serial_data sd ON s.id = sd.serial_id AND sd.key IN ('condition', 'size')
    WHERE s.deleted_at IS NULL
  `, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });

    // Transform to flatten serial_data
    const serials = {};
    (rows || []).forEach(row => {
      if (!serials[row.serial_number]) {
        serials[row.serial_number] = { ...row, batch_id: row.batch_id };
      }
      if (row.key) serials[row.serial_number][row.key] = row.value;
    });

    res.json(Object.values(serials));
  });
});

router.get('/events', (req, res) => {
  db.all(`
    SELECT e.*, s.serial_number, s.batch_id
    FROM events e
    LEFT JOIN serials s ON e.serial_id = s.id
    ORDER BY e.created_at DESC
    LIMIT 100
  `, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows || []);
  });
});

// Admin endpoints
router.get('/admin/users', verifyToken, checkRole(['admin', 'super_admin']), (req, res) => {
  db.all(`SELECT id, username, role, created_at FROM users ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows || []);
  });
});

router.post('/admin/users/:username/role', verifyToken, checkRole(['admin', 'super_admin']), (req, res) => {
  const { username } = req.params;
  const { role } = req.body;

  if (!['viewer', 'editor', 'admin', 'super_admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  db.run(`UPDATE users SET role = ? WHERE username = ?`, [role, username], function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, message: `User role updated to ${role}` });
  });
});

router.post('/admin/logo', verifyToken, checkRole(['admin', 'super_admin']), (req, res) => {
  const { logo_data, filename } = req.body;
  // For now, just return success - actual logo storage can be implemented later
  // Could save to file system or database
  res.json({ success: true, message: 'Logo uploaded', filename });
});

router.post('/admin/users', verifyToken, checkRole(['admin', 'super_admin']), async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
      [username, hashedPassword, role || 'viewer'], function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Username already exists' });
          }
          return res.status(400).json({ error: err.message });
        }
        res.json({ success: true, id: this.lastID });
      });
  } catch (err) {
    res.status(500).json({ error: 'Password hashing failed' });
  }
});

router.post('/admin/users/:username/password', verifyToken, checkRole(['admin', 'super_admin']), async (req, res) => {
  const { username } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`UPDATE users SET password = ? WHERE username = ?`, [hashedPassword, username], function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true, message: 'Password updated' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Password hashing failed' });
  }
});

// UPDATE endpoints for api_client
router.put('/styles/:style_number/data', validateStyleNumber, verifyToken, checkRole(['api_client', 'editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  const { product_name, description, care_instructions, delivery_returns, size_material_composition } = req.body;

  const updates = [];
  const values = [];

  if (product_name !== undefined) {
    updates.push('product_name = ?');
    values.push(product_name);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description);
  }
  if (care_instructions !== undefined) {
    updates.push('care_instructions = ?');
    values.push(care_instructions);
  }
  if (delivery_returns !== undefined) {
    updates.push('delivery_returns = ?');
    values.push(delivery_returns);
  }
  if (size_material_composition !== undefined) {
    updates.push('size_material_composition = ?');
    values.push(size_material_composition);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(style_number);

  const query = `UPDATE styles SET ${updates.join(', ')} WHERE style_number = ?`;
  db.run(query, values, function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, updated: this.changes });
  });
});

router.put('/batches/:batch_id/data', validateBatchId, verifyToken, checkRole(['api_client', 'editor', 'admin', 'super_admin']), (req, res) => {
  const { batch_id } = req.params;
  const { total_units, partner_name } = req.body;

  const updates = [];
  const values = [];

  if (total_units !== undefined) {
    updates.push('total_units = ?');
    values.push(total_units);
  }
  if (partner_name !== undefined) {
    updates.push('partner_name = ?');
    values.push(partner_name);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(batch_id);
  const query = `UPDATE batches SET ${updates.join(', ')} WHERE batch_id = ?`;
  db.run(query, values, function(err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true, updated: this.changes });
  });
});

router.put('/serials/:serial_number/data', validateSerialNumber, verifyToken, checkRole(['api_client', 'editor', 'admin', 'super_admin']), (req, res) => {
  const { serial_number } = req.params;
  const { sgtin_numeric, sgtin_uri, rfid, condition, size } = req.body;

  const updates = [];
  const values = [];

  if (sgtin_numeric !== undefined) {
    updates.push('sgtin_numeric = ?');
    values.push(sgtin_numeric);
  }
  if (sgtin_uri !== undefined) {
    updates.push('sgtin_uri = ?');
    values.push(sgtin_uri);
  }
  if (rfid !== undefined) {
    updates.push('rfid = ?');
    values.push(rfid);
  }

  if (updates.length === 0 && condition === undefined && size === undefined) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(serial_number);
  const serialQuery = `UPDATE serials SET ${updates.length > 0 ? updates.join(', ') + ',' : ''} updated_at = CURRENT_TIMESTAMP WHERE serial_number = ?`;

  db.run(updates.length > 0 ? `UPDATE serials SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE serial_number = ?` : `UPDATE serials SET updated_at = CURRENT_TIMESTAMP WHERE serial_number = ?`, values, function(err) {
    if (err) return res.status(400).json({ error: err.message });

    // Get serial_id to update serial_data
    db.get(`SELECT id FROM serials WHERE serial_number = ?`, [serial_number], (err, serial) => {
      if (err || !serial) return res.status(400).json({ error: 'Serial not found' });

      let dataUpdates = 0;
      let totalDataUpdates = 0;

      if (condition !== undefined) totalDataUpdates++;
      if (size !== undefined) totalDataUpdates++;

      if (totalDataUpdates === 0) {
        return res.json({ success: true, updated: true });
      }

      if (condition !== undefined) {
        db.run(
          `INSERT INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
          [serial.id, 'condition', condition, 'api_update'],
          () => {
            dataUpdates++;
            if (dataUpdates === totalDataUpdates) {
              res.json({ success: true, updated: true });
            }
          }
        );
      }

      if (size !== undefined) {
        db.run(
          `INSERT INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
          [serial.id, 'size', size, 'api_update'],
          () => {
            dataUpdates++;
            if (dataUpdates === totalDataUpdates) {
              res.json({ success: true, updated: true });
            }
          }
        );
      }
    });
  });
});

// Bulk import endpoint - external data ingestion
router.post('/import/bulk', verifyToken, checkRole(['api_client', 'editor', 'admin', 'super_admin']), (req, res) => {
  const { data } = req.body;

  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Data must be an array' });
  }

  const results = {
    total: data.length,
    styles: { created: 0, skipped: 0, errors: [] },
    batches: { created: 0, skipped: 0, errors: [] },
    serials: { created: 0, skipped: 0, errors: [] },
    timestamp: new Date().toISOString()
  };

  let processed = 0;

  data.forEach((item, index) => {
    try {
      if (item.type === 'style') {
        const { style_number, product_name, description, care_instructions, delivery_returns, size_material_composition } = item;

        if (!style_number) {
          results.styles.errors.push({ index, error: 'style_number required' });
          results.styles.skipped++;
          processed++;
          checkComplete();
          return;
        }

        db.run(
          `INSERT OR IGNORE INTO styles (style_number, product_name, description, care_instructions, delivery_returns, size_material_composition)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [style_number, product_name || null, description || null, care_instructions || null, delivery_returns || null, size_material_composition || null],
          function(err) {
            if (err) {
              results.styles.errors.push({ index, style_number, error: err.message });
              results.styles.skipped++;
            } else if (this.changes === 1) {
              results.styles.created++;
            } else {
              results.styles.skipped++;
            }
            processed++;
            checkComplete();
          }
        );
      } else if (item.type === 'batch') {
        const { batch_id, style_number, total_units, partner_name } = item;

        if (!batch_id || !style_number) {
          results.batches.errors.push({ index, error: 'batch_id and style_number required' });
          results.batches.skipped++;
          processed++;
          checkComplete();
          return;
        }

        db.run(
          `INSERT OR IGNORE INTO batches (batch_id, style_number, total_units, partner_name)
           VALUES (?, ?, ?, ?)`,
          [batch_id, style_number, total_units || 0, partner_name || null],
          function(err) {
            if (err) {
              results.batches.errors.push({ index, batch_id, error: err.message });
              results.batches.skipped++;
            } else if (this.changes === 1) {
              results.batches.created++;
            } else {
              results.batches.skipped++;
            }
            processed++;
            checkComplete();
          }
        );
      } else if (item.type === 'serial') {
        const { serial_number, batch_id, sgtin_numeric, sgtin_uri, rfid, condition, size } = item;

        if (!serial_number || !batch_id) {
          results.serials.errors.push({ index, error: 'serial_number and batch_id required' });
          results.serials.skipped++;
          processed++;
          checkComplete();
          return;
        }

        db.run(
          `INSERT OR IGNORE INTO serials (serial_number, batch_id, sgtin_numeric, sgtin_uri, rfid)
           VALUES (?, ?, ?, ?, ?)`,
          [serial_number, batch_id, sgtin_numeric || null, sgtin_uri || null, rfid || null],
          function(err) {
            if (err) {
              results.serials.errors.push({ index, serial_number, error: err.message });
              results.serials.skipped++;
              processed++;
              checkComplete();
            } else if (this.changes === 1) {
              const serialId = this.lastID;
              // Add default condition
              db.run(
                `INSERT INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
                [serialId, 'condition', condition || 'new', 'bulk_import'],
                () => {
                  // Add size if provided
                  if (size) {
                    db.run(
                      `INSERT INTO serial_data (serial_id, key, value, added_by) VALUES (?, ?, ?, ?)`,
                      [serialId, 'size', size, 'bulk_import'],
                      () => {
                        results.serials.created++;
                        processed++;
                        checkComplete();
                      }
                    );
                  } else {
                    results.serials.created++;
                    processed++;
                    checkComplete();
                  }
                }
              );
            } else {
              results.serials.skipped++;
              processed++;
              checkComplete();
            }
          }
        );
      } else {
        results[item.type]?.errors?.push({ index, error: 'Unknown type: ' + item.type });
        processed++;
        checkComplete();
      }
    } catch (err) {
      results[item.type]?.errors?.push({ index, error: err.message });
      processed++;
      checkComplete();
    }
  });

  function checkComplete() {
    if (processed === data.length) {
      res.json(results);
    }
  }
});

// Track public passport views
router.post('/track-public-view', (req, res) => {
  const { page_type, page_id } = req.body;

  if (page_type !== 'public_passport' || !page_id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  // Increment the serial's view_count
  db.run(
    `UPDATE serials SET view_count = view_count + 1 WHERE serial_number = ?`,
    [page_id],
    (err) => {
      if (err) {
        console.error('Error updating view count:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    }
  );
});

// Scan endpoint - lazy-load serials on first scan
router.post('/scan', (req, res) => {
  const { style_number, variant, batch_id, serial_number } = req.body;

  // Validate required fields
  if (!style_number || !batch_id || !serial_number) {
    return res.status(400).json({ error: 'Missing required fields: style_number, batch_id, serial_number' });
  }

  // Verify style exists
  db.get(`SELECT * FROM styles WHERE style_number = ? AND variant IS ?`, [style_number, variant || null], (err, style) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!style) {
      return res.status(404).json({ error: `Style ${style_number}${variant ? '-' + variant : ''} not found` });
    }

    // Verify batch exists
    db.get(`SELECT * FROM batches WHERE batch_id = ?`, [batch_id], (err, batch) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!batch) {
        return res.status(404).json({ error: `Batch ${batch_id} not found` });
      }

      // Check if serial already exists
      db.get(
        `SELECT * FROM serials WHERE batch_id = ? AND serial_number = ? AND style_number = ? AND variant IS ?`,
        [batch_id, serial_number, style_number, variant || null],
        (err, existingSerial) => {
          if (err) return res.status(400).json({ error: err.message });

          if (existingSerial) {
            // Serial already exists - return it
            return returnSerialData(existingSerial.id, res);
          }

          // Create new serial (lazy-load on first scan)
          db.run(
            `INSERT INTO serials (batch_id, style_number, variant, serial_number) VALUES (?, ?, ?, ?)`,
            [batch_id, style_number, variant || null, serial_number],
            function(err) {
              if (err) return res.status(400).json({ error: err.message });

              // Add event for scan
              db.run(
                `INSERT INTO events (serial_id, event_type, event_data) VALUES (?, ?, ?)`,
                [this.lastID, 'scanned', JSON.stringify({ action: 'first_scan', timestamp: new Date().toISOString() })],
                (err) => {
                  if (err) console.error('Error adding scan event:', err);
                  returnSerialData(this.lastID, res, true);
                }
              );
            }
          );
        }
      );
    });
  });

  function returnSerialData(serialId, res, isNew = false) {
    db.get(`SELECT * FROM serials WHERE id = ?`, [serialId], (err, serial) => {
      if (err) return res.status(400).json({ error: err.message });

      db.get(`SELECT * FROM styles WHERE style_number = ? AND variant IS ?`, [serial.style_number, serial.variant || null], (err, style) => {
        if (err) return res.status(400).json({ error: err.message });

        db.get(`SELECT * FROM batches WHERE batch_id = ?`, [serial.batch_id], (err, batch) => {
          if (err) return res.status(400).json({ error: err.message });

          res.json({
            created: isNew,
            serial: serial,
            style: style,
            batch: batch
          });
        });
      });
    });
  }
});

module.exports = router;
