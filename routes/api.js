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
        `INSERT INTO batches (batch_id, total_units, partner_name, deleted_at) VALUES (?, ?, ?, NULL)`,
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
      // If no serials provided, batch is created successfully without serials
      if (!serials || serials.length === 0) {
        return res.json({
          success: true,
          batch_id,
          serials_imported: 0
        });
      }

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
  const { product_type, variant, product_name, description, care_instructions, delivery_returns, size_material_composition, gtin_14 } = req.body;
  console.log('API received care_instructions:', care_instructions, 'length:', care_instructions ? care_instructions.length : 0);
  // Normalize product_type to standard format: 'Jeans' or 'Tops'
  let normalizedProductType = String(product_type || 'Jeans').trim();
  const lowerType = normalizedProductType.toLowerCase();
  if (lowerType === 'tops' || lowerType === 'topp') {
    normalizedProductType = 'Tops';
  } else {
    normalizedProductType = 'Jeans';
  }

  const trimmedVariant = typeof variant === 'string' ? variant.trim() : '';
  const normalizedVariant = normalizedProductType === 'Tops' ? trimmedVariant.toUpperCase() : null;

  if (normalizedProductType === 'Tops' && !normalizedVariant) {
    return res.status(400).json({ error: 'Variant is required when product type is Tops' });
  }

  if (normalizedProductType === 'Tops' && !/^[A-Z0-9-]+$/.test(normalizedVariant)) {
    return res.status(400).json({ error: 'Variant must only contain letters, numbers or dashes' });
  }

  // Use DELETE + INSERT to ensure clean update
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.run('DELETE FROM styles WHERE style_number = ? AND (variant = ? OR (variant IS NULL AND ? IS NULL))',
      [style_number, normalizedVariant, normalizedVariant],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: 'Delete failed: ' + err.message });
        }

        db.run(`
          INSERT INTO styles (style_number, variant, product_type, product_name, description, care_instructions, delivery_returns, size_material_composition, gtin_14)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [style_number, normalizedVariant, normalizedProductType, product_name, description, care_instructions, delivery_returns, size_material_composition, gtin_14], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(400).json({ error: 'Insert failed: ' + err.message });
          }

          db.run('COMMIT', function(err) {
            if (err) {
              return res.status(400).json({ error: 'Commit failed: ' + err.message });
            }
            res.json({ success: true, style_number, variant: normalizedVariant });
          });
        });
      }
    );
  });
});

// Save transparency data
router.post('/styles/:style_number/transparency', validateStyleNumber, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  const { variant, suppliers_chain, certifications, environmental_data, social_data } = req.body;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.run('DELETE FROM transparency_data WHERE style_number = ? AND (variant = ? OR (variant IS NULL AND ? IS NULL))',
      [style_number, variant || null, variant || null],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: 'Delete failed: ' + err.message });
        }

        db.run(`
          INSERT INTO transparency_data (style_number, variant, suppliers_chain, certifications, environmental_data, social_data)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [style_number, variant || null, JSON.stringify(suppliers_chain), JSON.stringify(certifications), JSON.stringify(environmental_data), JSON.stringify(social_data)], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(400).json({ error: 'Insert failed: ' + err.message });
          }

          db.run('COMMIT', function(err) {
            if (err) return res.status(400).json({ error: 'Commit failed: ' + err.message });
            res.json({ success: true, style_number, variant: variant || null });
          });
        });
      }
    );
  });
});

// Save Nudie values
router.post('/styles/:style_number/nudie-values', validateStyleNumber, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  const { variant, repair_info, trade_in_info, partner_links } = req.body;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.run('DELETE FROM nudie_values WHERE style_number = ? AND (variant = ? OR (variant IS NULL AND ? IS NULL))',
      [style_number, variant || null, variant || null],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: 'Delete failed: ' + err.message });
        }

        db.run(`
          INSERT INTO nudie_values (style_number, variant, repair_info, trade_in_info, partner_links)
          VALUES (?, ?, ?, ?, ?)
        `, [style_number, variant || null, repair_info, trade_in_info, JSON.stringify(partner_links)], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(400).json({ error: 'Insert failed: ' + err.message });
          }

          db.run('COMMIT', function(err) {
            if (err) return res.status(400).json({ error: 'Commit failed: ' + err.message });
            res.json({ success: true, style_number, variant: variant || null });
          });
        });
      }
    );
  });
});

// Save storytelling
router.post('/styles/:style_number/storytelling', validateStyleNumber, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  const { variant, summary, content, links } = req.body;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.run('DELETE FROM storytelling WHERE style_number = ? AND (variant = ? OR (variant IS NULL AND ? IS NULL))',
      [style_number, variant || null, variant || null],
      function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: 'Delete failed: ' + err.message });
        }

        db.run(`
          INSERT INTO storytelling (style_number, variant, summary, content, links)
          VALUES (?, ?, ?, ?, ?)
        `, [style_number, variant || null, summary, content, JSON.stringify(links)], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(400).json({ error: 'Insert failed: ' + err.message });
          }

          db.run('COMMIT', function(err) {
            if (err) return res.status(400).json({ error: 'Commit failed: ' + err.message });
            res.json({ success: true, style_number, variant: variant || null });
          });
        });
      }
    );
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

  db.get(`SELECT * FROM styles WHERE style_number = ? AND variant ${normalizedVariant ? '= ?' : 'IS NULL'}`, normalizedVariant ? [style_number, normalizedVariant] : [style_number], (err, style) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!style) return res.status(404).json({ error: 'Style not found' });

    db.all(`SELECT * FROM transparency_data WHERE style_number = ? AND variant ${normalizedVariant ? '= ?' : 'IS NULL'}`, normalizedVariant ? [style_number, normalizedVariant] : [style_number], (err, transparency) => {
      db.all(`SELECT * FROM nudie_values WHERE style_number = ? AND variant ${normalizedVariant ? '= ?' : 'IS NULL'}`, normalizedVariant ? [style_number, normalizedVariant] : [style_number], (err, nudieValues) => {
        db.all(`SELECT * FROM storytelling WHERE style_number = ? AND variant ${normalizedVariant ? '= ?' : 'IS NULL'}`, normalizedVariant ? [style_number, normalizedVariant] : [style_number], (err, storytelling) => {
          db.all(`
            SELECT DISTINCT b.*, (SELECT COUNT(*) FROM serials WHERE batch_id = b.batch_id AND style_number = ? AND variant ${normalizedVariant ? '= ?' : 'IS NULL'}) as serial_count
            FROM batches b
            WHERE b.batch_id IN (
              SELECT DISTINCT batch_id FROM serials WHERE style_number = ? AND variant ${normalizedVariant ? '= ?' : 'IS NULL'}
              UNION
              SELECT DISTINCT batch_id FROM batch_style_data WHERE style_number = ? AND variant ${normalizedVariant ? '= ?' : 'IS NULL'}
            )
          `, normalizedVariant ? [style_number, normalizedVariant, style_number, normalizedVariant, style_number, normalizedVariant] : [style_number, style_number, style_number], (err, batches) => {
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

// Save batch metadata (use transaction to avoid race conditions)
router.post('/batch/metadata', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { batch_id, production_date, manufacturing_details } = req.body;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) return res.status(400).json({ error: err.message });

      db.run(`DELETE FROM batch_data WHERE batch_id = ? AND key IN ('production_date', 'manufacturing_details')`, [batch_id], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: err.message });
        }

        // Insert both values in one statement to ensure atomicity
        db.run(
          `INSERT INTO batch_data (batch_id, key, value) VALUES (?, ?, ?), (?, ?, ?)`,
          [batch_id, 'production_date', production_date, batch_id, 'manufacturing_details', manufacturing_details],
          (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(400).json({ error: err.message });
            }

            db.run('COMMIT', (err) => {
              if (err) return res.status(400).json({ error: err.message });
              res.json({ success: true });
            });
          }
        );
      });
    });
  });
});

// ✨ PHASE 2: Save batch style composition with pass-versioning
// POST /batches/:batch_id/style-composition/correct - Creates new pass version (for corrections)
router.post('/batches/:batch_id/style-composition/correct', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { batch_id } = req.params;
  let { style_number, variant, composition, change_type, change_note } = req.body;
  const changed_by = req.user?.username || 'system';

  // Validate inputs
  if (!composition || !composition.trim()) {
    return res.status(400).json({ error: 'Composition cannot be empty' });
  }
  if (!change_type || !['correction', 'update', 'clarification'].includes(change_type)) {
    return res.status(400).json({ error: 'Valid change_type required: correction, update, or clarification' });
  }

  variant = (variant && variant.trim()) ? variant.trim() : null;

  // Transaction: Archive old version + create new version + log to audit
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) return res.status(400).json({ error: err.message });

      const variantCondition = variant === null ? 'IS NULL' : '= ?';
      const selectParams = variant === null ? [batch_id, style_number] : [batch_id, style_number, variant];

      // 1. Get current record (if exists)
      db.get(`
        SELECT id, composition, pass_version FROM batch_style_data
        WHERE batch_id = ? AND style_number = ? AND variant ${variantCondition}
      `, selectParams, (err, current) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: err.message });
        }

        const newPassVersion = (current?.pass_version || 0) + 1;
        const recordId = `${batch_id}/${style_number}${variant ? '/' + variant : ''}`;

        // 2. Archive old version (if exists)
        if (current) {
          db.run(`
            INSERT INTO batch_style_data_archive
            (pass_version, batch_id, style_number, variant, composition, pass_issued_at, pass_change_type, pass_change_note, pass_supersedes)
            SELECT pass_version, batch_id, style_number, variant, composition, pass_issued_at, pass_change_type, pass_change_note, pass_supersedes
            FROM batch_style_data
            WHERE id = ?
          `, [current.id], (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(400).json({ error: err.message });
            }
            updateOrInsert();
          });
        } else {
          updateOrInsert();
        }

        function updateOrInsert() {
          // 3. Update or insert with new pass version
          if (current) {
            db.run(`
              UPDATE batch_style_data
              SET composition = ?, pass_version = ?, pass_issued_at = CURRENT_TIMESTAMP,
                  pass_change_type = ?, pass_change_note = ?, pass_supersedes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [composition, newPassVersion, change_type, change_note, current.id, changed_by, current.id], (err) => {
              if (err) {
                db.run('ROLLBACK');
                return res.status(400).json({ error: err.message });
              }
              auditLog();
            });
          } else {
            db.run(`
              INSERT INTO batch_style_data
              (batch_id, style_number, variant, composition, pass_version, pass_issued_at, pass_change_type, pass_change_note, updated_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [batch_id, style_number, variant, composition, change_type, change_note, changed_by], (err) => {
              if (err) {
                db.run('ROLLBACK');
                return res.status(400).json({ error: err.message });
              }
              auditLog();
            });
          }
        }

        function auditLog() {
          // 4. Log to audit_log with full pass versioning info
          db.run(`
            INSERT INTO audit_log
            (table_name, record_id, pass_version, action, change_type, change_note, old_value, new_value, changed_by)
            VALUES ('batch_style_data', ?, ?, 'composition_updated', ?, ?, ?, ?, ?)
          `, [recordId, newPassVersion, change_type, change_note, current?.composition || null, composition, changed_by], (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(400).json({ error: err.message });
            }

            db.run('COMMIT', (err) => {
              if (err) return res.status(400).json({ error: err.message });
              res.json({
                success: true,
                batch_id,
                style_number,
                variant,
                pass_version: newPassVersion,
                pass_issued_at: new Date().toISOString(),
                message: `Pass version ${newPassVersion} issued (${change_type})`
              });
            });
          });
        }
      });
    });
  });
});

// GET /batches/:batch_id/style-composition/history - Get version history
router.get('/batches/:batch_id/style-composition/history', verifyToken, (req, res) => {
  const { batch_id } = req.params;
  let { style_number, variant } = req.query;

  if (!style_number) {
    return res.status(400).json({ error: 'style_number query parameter required' });
  }

  // Normalize variant: null, 'null', or undefined all become null
  variant = (variant && variant !== 'null' && variant.trim()) ? variant.trim() : null;

  const variantCondition = variant === null ? 'IS NULL' : '= ?';
  const selectParams = variant === null
    ? [batch_id, style_number]
    : [batch_id, style_number, variant];

  db.serialize(() => {
    // Get current version
    db.get(`
      SELECT id, pass_version, composition, pass_issued_at, pass_change_type, pass_change_note, pass_supersedes, updated_by
      FROM batch_style_data
      WHERE batch_id = ? AND style_number = ? AND variant ${variantCondition}
    `, selectParams, (err, current) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      // Get archive
      db.all(`
        SELECT pass_version, composition, pass_issued_at, pass_change_type, pass_change_note, pass_supersedes, archived_at
        FROM batch_style_data_archive
        WHERE batch_id = ? AND style_number = ? AND variant ${variantCondition}
        ORDER BY pass_version ASC
      `, selectParams, (err, archived) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }

        // Combine and format (archive rows have pass_version, current has pass_version)
        const history = [
          ...(archived || []).map(row => ({
            version: row.pass_version,
            issued_at: row.pass_issued_at,
            change_type: row.pass_change_type,
            change_note: row.pass_change_note,
            composition: row.composition,
            supersedes: row.pass_supersedes
          })),
          current && {
            version: current.pass_version,
            issued_at: current.pass_issued_at,
            change_type: current.pass_change_type,
            change_note: current.pass_change_note,
            composition: current.composition,
            supersedes: current.pass_supersedes,
            issued_by: current.updated_by
          }
        ].filter(Boolean).sort((a, b) => a.version - b.version);

        res.json({
          batch_id,
          style_number,
          variant,
          current_version: current?.pass_version || 0,
          history
        });
      });
    });
  });
});

// GET /audit-log - Get audit trail for compliance tracking
router.get('/audit-log', verifyToken, (req, res) => {
  const { table_name, record_id } = req.query;

  if (!table_name || !record_id) {
    return res.status(400).json({ error: 'table_name and record_id query parameters required' });
  }

  db.all(`
    SELECT id, table_name, record_id, pass_version, action, change_type, change_note, old_value, new_value, changed_by, created_at
    FROM audit_log
    WHERE table_name = ? AND record_id = ?
    ORDER BY created_at ASC
  `, [table_name, record_id], (err, rows) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    res.json({
      table_name,
      record_id,
      entries: rows || [],
      total: (rows || []).length
    });
  });
});

// Legacy: Save batch style composition (backward compat, redirects to /correct)
router.post('/batches/:batch_id/style-composition', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  // Create new batch style composition or update existing
  const { batch_id } = req.params;
  let { style_number, variant, composition } = req.body;

  if (!style_number) {
    return res.status(400).json({ error: 'style_number is required' });
  }

  const changed_by = req.user?.username || 'system';
  variant = (variant && variant.trim()) ? variant.trim() : null;
  composition = (composition && composition.trim()) || null;  // Allow null/empty composition

  // Insert new batch_style_data record (initial creation)
  db.run(`
    INSERT INTO batch_style_data
    (batch_id, style_number, variant, composition, pass_version, pass_issued_at, pass_change_type, pass_change_note, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 'initial', 'Initial product added to batch', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [batch_id, style_number, variant, composition || null, changed_by], function(err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    // Log to audit_log
    const recordId = `${batch_id}/${style_number}${variant ? '/' + variant : ''}`;
    db.run(`
      INSERT INTO audit_log
      (table_name, record_id, pass_version, action, change_type, change_note, old_value, new_value, changed_by)
      VALUES ('batch_style_data', ?, 1, 'composition_created', 'initial', 'Initial product added to batch', NULL, ?, ?)
    `, [recordId, composition, changed_by], (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      res.json({
        success: true,
        batch_id,
        style_number,
        variant,
        pass_version: 1,
        pass_issued_at: new Date().toISOString(),
        message: 'Product added to batch'
      });
    });
  });
});

// Get batch style composition
router.get('/batches/:batch_id/style-composition', (req, res) => {
  const { batch_id } = req.params;
  const { style_number, variant } = req.query;

  const variantClause = variant ? 'AND variant = ?' : 'AND variant IS NULL';
  const params = variant ? [batch_id, style_number, variant] : [batch_id, style_number];

  db.get(`
    SELECT composition FROM batch_style_data
    WHERE batch_id = ? AND style_number = ? ${variantClause}
  `, params, (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ composition: row?.composition || null });
  });
});

// Delete product from batch (removes from batch_style_data and all associated serials)
router.delete('/batches/:batch_id/product', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { batch_id } = req.params;
  let { style_number, variant } = req.body;

  console.log('DELETE /batches/:batch_id/product', { batch_id, style_number, variant });

  // Normalize variant: empty string or null becomes null
  variant = (variant && typeof variant === 'string' && variant.trim() !== '') ? variant.trim() : null;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) return res.status(400).json({ error: err.message });

      // Delete all serials for this product in this batch FIRST (child records)
      const variantCondition = variant === null
        ? 'variant IS NULL'
        : 'variant = ?';
      const variantParams = variant === null ? [] : [variant];

      db.run(`
        DELETE FROM serials
        WHERE batch_id = ? AND style_number = ? AND ${variantCondition}
      `, [batch_id, style_number, ...variantParams], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: 'Failed to delete serials: ' + err.message });
        }

        // Then delete from batch_style_data
        db.run(`
          DELETE FROM batch_style_data
          WHERE batch_id = ? AND style_number = ? AND ${variantCondition}
        `, [batch_id, style_number, ...variantParams], (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(400).json({ error: 'Failed to delete batch_style_data: ' + err.message });
          }

          db.run('COMMIT', (err) => {
            if (err) return res.status(400).json({ error: 'Commit failed: ' + err.message });
            res.json({ success: true });
          });
        });
      });
    });
  });
});

// Get full DPP data for a batch (with all serials)
// Get batch with metadata and style data
router.get('/batches/:batch_id', (req, res) => {
  const { batch_id } = req.params;

  db.get(`SELECT * FROM batches WHERE batch_id = ?`, [batch_id], (err, batch) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    db.all(`SELECT * FROM batch_data WHERE batch_id = ?`, [batch_id], (err, batch_data) => {
      db.all(`SELECT style_number, variant, composition FROM batch_style_data WHERE batch_id = ?`, [batch_id], (err, batch_style_data) => {
        res.json({ batch, batch_data: batch_data || [], batch_style_data: batch_style_data || [] });
      });
    });
  });
});

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
            // Get batch_style_data (styles with composition but no serials)
            db.all(`
              SELECT style_number, variant, composition FROM batch_style_data WHERE batch_id = ?
            `, [batch_id], (err, batchStyleData) => {
              // Get batch_data (production_date, manufacturing_details)
              db.all(`
                SELECT * FROM batch_data WHERE batch_id = ?
              `, [batch_id], (err, batchData) => {
                res.json({
                  batch: batch,
                  batch_data: batchData || [],
                  style: style || null,
                  transparency_data: transData,
                  serials: serials || [],
                  serial_data: allSerialData || [],
                  batch_style_data: batchStyleData || []
                });
              });
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

// Get style images (with variant support)
router.get('/styles/:style_number/images', (req, res) => {
  const { style_number } = req.params;
  const { variant } = req.query;

  const variantClause = variant ? 'AND variant = ?' : 'AND variant IS NULL';
  const params = variant ? [style_number, variant] : [style_number];

  db.all(`SELECT id, image_name, image_data, variant FROM style_images WHERE style_number = ? ${variantClause} ORDER BY created_at DESC`, params, (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows || []);
  });
});

// Upload style image (with variant support)
router.post('/styles/:style_number/image', validateStyleNumber, validateImageUpload, verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  const { image_data, image_name, variant } = req.body;

  if (!image_data) {
    return res.status(400).json({ error: 'image_data required' });
  }

  db.run(`INSERT INTO style_images (style_number, variant, image_data, image_name) VALUES (?, ?, ?, ?)`,
    [style_number, variant || null, image_data, image_name], function(err) {
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

// Delete style (soft delete with variant support)
router.delete('/styles/:style_number', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { style_number } = req.params;
  const { variant } = req.query;

  // Soft delete using deleted_at
  const variantClause = variant ? 'AND variant = ?' : 'AND variant IS NULL';
  const params = variant ? [style_number, variant] : [style_number];

  db.run(`UPDATE styles SET deleted_at = CURRENT_TIMESTAMP WHERE style_number = ? ${variantClause}`, params, function(err) {
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

// Delete batch (hard delete - removes from database)
// Only allowed if batch has no serials
router.delete('/batches/:batch_id', verifyToken, checkRole(['editor', 'admin', 'super_admin']), (req, res) => {
  const { batch_id } = req.params;

  // Check if batch has any serials
  db.get(`SELECT COUNT(*) as count FROM serials WHERE batch_id = ?`, [batch_id], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });

    if (row && row.count > 0) {
      return res.status(400).json({
        error: `Cannot delete batch: Contains ${row.count} serial(s). Remove all serials first.`
      });
    }

    // Safe to delete
    db.run(`DELETE FROM batches WHERE batch_id = ?`, [batch_id], function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true });
    });
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
              if (err) {
                if (err.message.includes('UNIQUE constraint failed: serials.serial_number')) {
                  return res.status(409).json({ error: `❌ Serial ${serial_number} already exists` });
                }
                return res.status(400).json({ error: err.message });
              }

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

// Get recent batches (5 latest)
router.get('/recent/batches', (req, res) => {
  db.all(`
    SELECT batch_id, partner_name, created_at,
           (SELECT COUNT(*) FROM serials WHERE batch_id = batches.batch_id AND deleted_at IS NULL) as serial_count
    FROM batches
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 5
  `, (err, batches) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ batches: batches || [] });
  });
});

// Get batches for a specific style
router.get('/styles/:style_number/batches', (req, res) => {
  const { style_number } = req.params;

  db.all(`
    SELECT DISTINCT b.batch_id, b.partner_name, b.po, COUNT(s.id) as unit_count
    FROM batches b
    LEFT JOIN serials s ON b.batch_id = s.batch_id AND s.style_number = ?
    WHERE b.batch_id IN (
      SELECT DISTINCT batch_id FROM serials WHERE style_number = ?
    )
    GROUP BY b.batch_id
    ORDER BY b.batch_id
  `, [style_number, style_number], (err, batches) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ batches: batches || [] });
  });
});

// Get recent styles (5 latest)
router.get('/recent/styles', (req, res) => {
  db.all(`
    SELECT DISTINCT style_number, variant, product_type, product_name, created_at
    FROM styles
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 5
  `, (err, styles) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ styles: styles || [] });
  });
});

module.exports = router;
