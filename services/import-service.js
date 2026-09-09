/**
 * Import Service for Product Data
 *
 * Handles bulk import of GTIN data from CSV files with support for:
 * - Multiple product types (jeans, t-shirts, kids, no-size)
 * - Auto-detection of product type from item numbers
 * - Validation of size components per product type
 * - Duplicate detection and conflict handling
 * - Dry-run mode for validation without database changes
 *
 * Phase 3 of 5 (Import System)
 * Status: Production-ready
 */

const ProductTypeConfig = require('./product-type-config');
const db = require('../db/init-v2').db;

// Helper to run SQL queries with promises
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const getOne = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const getAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

class ImportService {
  /**
   * Parse CSV content into rows
   * @param {string} csvContent - Raw CSV content
   * @returns {Object} { headers: [], rows: [] }
   */
  static parseCSV(csvContent) {
    const lines = csvContent.trim().split('\n');
    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    // Parse header row
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = line.split(',').map(v => v.trim());
      const row = {};

      headers.forEach((header, idx) => {
        row[header] = values[idx] || null;
      });

      rows.push(row);
    }

    return { headers, rows };
  }

  /**
   * Validate a single row for required fields and format
   * @param {Object} row - Data row from CSV
   * @param {Array} requiredFields - Required field names
   * @returns {Object} { valid: true/false, errors: [] }
   */
  static validateRowStructure(row, requiredFields) {
    const errors = [];

    requiredFields.forEach(field => {
      if (!row[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Detect product type from item number using pattern matching
   * Falls back to explicit product_type field if provided
   * @param {Object} row - Data row with item_number or product_type
   * @returns {Object} { type: string, detected: boolean, confidence: number }
   */
  static detectProductType(row) {
    // If explicit product_type provided, use it
    if (row.product_type) {
      const config = ProductTypeConfig.getProductType(row.product_type);
      if (config) {
        return {
          type: row.product_type,
          detected: false,
          confidence: 1.0,
          reason: 'Explicitly set'
        };
      }
    }

    // Try to detect from item_number pattern
    if (row.item_number) {
      const result = ProductTypeConfig.detectProductType(row.item_number);
      if (result.type) {
        return {
          type: result.type,
          detected: true,
          confidence: result.confidence,
          reason: 'Pattern matched'
        };
      }
    }

    return {
      type: null,
      detected: false,
      confidence: 0,
      reason: 'No product type specified and could not detect from item_number'
    };
  }

  /**
   * Validate a single GTIN row
   * @param {Object} row - Data row
   * @param {number} rowIndex - Row number (for error reporting)
   * @returns {Object} { valid: true/false, errors: [], productType: string, parsed: Object }
   */
  static validateGtinRow(row, rowIndex) {
    const errors = [];

    // Check required fields
    if (!row.gtin || row.gtin.trim().length === 0) {
      errors.push('Missing GTIN');
    }

    if (!row.batch_id || row.batch_id.trim().length === 0) {
      errors.push('Missing batch_id');
    }

    if (!row.style_id || row.style_id.toString().trim().length === 0) {
      errors.push('Missing style_id');
    }

    // Detect product type
    const typeDetection = this.detectProductType(row);
    if (!typeDetection.type) {
      errors.push(`Cannot determine product type: ${typeDetection.reason}`);
    }

    // If we have a product type and item_number, validate parsing
    let parsed = null;
    if (typeDetection.type && row.item_number) {
      parsed = ProductTypeConfig.parseItemNumber(row.item_number, typeDetection.type);
      if (!parsed) {
        errors.push(`Cannot parse item_number "${row.item_number}" as ${typeDetection.type}`);
      }
    }

    // If we have a product type, validate size components
    if (typeDetection.type && parsed) {
      const validation = ProductTypeConfig.validateSize(parsed, typeDetection.type);
      if (!validation.valid) {
        errors.push(`Invalid size components: ${validation.errors.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      productType: typeDetection.type,
      productTypeDetection: typeDetection,
      parsed: parsed || null,
      rowIndex: rowIndex + 2 // +2 because rows start at 1 and header is at 0
    };
  }

  /**
   * Check if GTIN already exists in the batch
   * @param {number} batchId - Batch ID
   * @param {string} gtin - GTIN value
   * @returns {Promise<boolean>}
   */
  static async gtinExistsInBatch(batchId, gtin) {
    const row = await getOne(
      'SELECT id FROM gtins WHERE batch_id = ? AND gtin = ?',
      [batchId, gtin]
    );
    return !!row;
  }

  /**
   * Validate batch exists
   * @param {number} batchId - Batch ID
   * @returns {Promise<Object>} Batch record or null
   */
  static async validateBatchExists(batchId) {
    return getOne('SELECT * FROM batches WHERE id = ?', [batchId]);
  }

  /**
   * Validate style exists
   * @param {number} styleId - Style ID
   * @returns {Promise<Object>} Style record or null
   */
  static async validateStyleExists(styleId) {
    return getOne('SELECT * FROM styles WHERE id = ?', [styleId]);
  }

  /**
   * Import GTIN data from CSV
   *
   * @param {string} csvContent - Raw CSV content
   * @param {Object} options - Import options
   *   - dryRun: Boolean (default false) - validate without inserting
   *   - skipDuplicates: Boolean (default true) - skip if GTIN exists
   *   - onProgress: Function - callback for progress updates
   * @returns {Promise<Object>} Import summary with results and errors
   */
  static async importFromCSV(csvContent, options = {}) {
    const {
      dryRun = false,
      skipDuplicates = true,
      onProgress = null
    } = options;

    const summary = {
      totalRows: 0,
      created: [],
      skipped: [],
      errors: [],
      dryRun: dryRun,
      timestamp: new Date().toISOString()
    };

    try {
      // Parse CSV
      const { headers, rows } = this.parseCSV(csvContent);
      summary.totalRows = rows.length;

      // Validate headers
      const requiredFields = ['gtin', 'batch_id', 'style_id', 'item_number'];
      const missingFields = requiredFields.filter(f => !headers.includes(f));

      if (missingFields.length > 0) {
        summary.errors.push({
          type: 'INVALID_HEADERS',
          message: `Missing required columns: ${missingFields.join(', ')}`
        });
        return summary;
      }

      // Process each row
      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];

        if (onProgress) {
          onProgress({
            current: idx + 1,
            total: rows.length,
            status: 'processing'
          });
        }

        // Validate row structure and content
        const validation = this.validateGtinRow(row, idx);
        if (!validation.valid) {
          summary.errors.push({
            rowIndex: validation.rowIndex,
            gtin: row.gtin,
            errors: validation.errors
          });
          continue;
        }

        // Validate batch exists
        const batch = await this.validateBatchExists(parseInt(row.batch_id));
        if (!batch) {
          summary.errors.push({
            rowIndex: validation.rowIndex,
            gtin: row.gtin,
            errors: [`Batch ID ${row.batch_id} not found`]
          });
          continue;
        }

        // Validate style exists
        const style = await this.validateStyleExists(parseInt(row.style_id));
        if (!style) {
          summary.errors.push({
            rowIndex: validation.rowIndex,
            gtin: row.gtin,
            errors: [`Style ID ${row.style_id} not found`]
          });
          continue;
        }

        // Check for duplicates
        const exists = await this.gtinExistsInBatch(parseInt(row.batch_id), row.gtin);
        if (exists) {
          if (skipDuplicates) {
            summary.skipped.push({
              rowIndex: validation.rowIndex,
              gtin: row.gtin,
              reason: 'GTIN already exists in this batch'
            });
            continue;
          }
        }

        // Prepare GTIN record
        const gtinRecord = {
          batch_id: parseInt(row.batch_id),
          style_id: parseInt(row.style_id),
          gtin: row.gtin.trim(),
          ean: row.ean || null,
          product_type: validation.productType,
          item_number: row.item_number || null,
          size_value_1: validation.parsed?.size_value_1 || null,
          size_value_2: validation.parsed?.size_value_2 || null,
          size_value_3: validation.parsed?.size_value_3 || null,
          weight: row.weight ? parseFloat(row.weight) : null
        };

        // If dry run, just collect the record without inserting
        if (!dryRun) {
          try {
            const sql = `
              INSERT INTO gtins (
                batch_id, style_id, gtin, ean, product_type, item_number,
                size_value_1, size_value_2, size_value_3, weight
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await runQuery(sql, [
              gtinRecord.batch_id,
              gtinRecord.style_id,
              gtinRecord.gtin,
              gtinRecord.ean,
              gtinRecord.product_type,
              gtinRecord.item_number,
              gtinRecord.size_value_1,
              gtinRecord.size_value_2,
              gtinRecord.size_value_3,
              gtinRecord.weight
            ]);

            summary.created.push({
              rowIndex: validation.rowIndex,
              gtin: row.gtin,
              productType: validation.productType,
              displaySize: validation.parsed?.display || null
            });
          } catch (err) {
            summary.errors.push({
              rowIndex: validation.rowIndex,
              gtin: row.gtin,
              errors: [`Database error: ${err.message}`]
            });
          }
        } else {
          // Dry run: just validate
          summary.created.push({
            rowIndex: validation.rowIndex,
            gtin: row.gtin,
            productType: validation.productType,
            displaySize: validation.parsed?.display || null,
            dryRunValidated: true
          });
        }
      }

      if (onProgress) {
        onProgress({
          current: rows.length,
          total: rows.length,
          status: 'complete'
        });
      }

      return summary;
    } catch (err) {
      summary.errors.push({
        type: 'FATAL_ERROR',
        message: err.message
      });
      return summary;
    }
  }

  /**
   * Get import summary statistics
   * @param {Object} summary - Import result summary
   * @returns {Object} Statistics with counts and percentages
   */
  static getSummaryStats(summary) {
    const totalProcessed = summary.created.length + summary.skipped.length + summary.errors.length;

    return {
      totalRows: summary.totalRows,
      totalProcessed: totalProcessed,
      created: summary.created.length,
      skipped: summary.skipped.length,
      errors: summary.errors.length,
      successRate: totalProcessed > 0 ? ((summary.created.length / totalProcessed) * 100).toFixed(1) : 0,
      dryRun: summary.dryRun
    };
  }

  /**
   * Format import summary for logging
   * @param {Object} summary - Import result summary
   * @returns {string} Formatted summary text
   */
  static formatSummary(summary) {
    const stats = this.getSummaryStats(summary);
    const dryRunLabel = summary.dryRun ? ' [DRY RUN]' : '';

    let text = `\n=== IMPORT SUMMARY${dryRunLabel} ===\n`;
    text += `Total Rows: ${stats.totalRows}\n`;
    text += `Created: ${stats.created}\n`;
    text += `Skipped: ${stats.skipped}\n`;
    text += `Errors: ${stats.errors}\n`;
    text += `Success Rate: ${stats.successRate}%\n`;

    if (summary.errors.length > 0 && summary.errors.length <= 10) {
      text += '\nFirst errors:\n';
      summary.errors.slice(0, 10).forEach(err => {
        const errText = err.errors ? err.errors.join('; ') : err.message;
        text += `  Row ${err.rowIndex}: ${errText}\n`;
      });
    }

    return text;
  }
}

module.exports = ImportService;
