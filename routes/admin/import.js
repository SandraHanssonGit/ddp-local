/**
 * Import Routes - Handle bulk CSV import of GTIN data
 *
 * Routes:
 * - GET /admin/import - Import form page
 * - POST /admin/import/preview - Dry-run validation
 * - POST /admin/import/execute - Execute actual import
 *
 * Phase 3 of 5 (Import System)
 */

const express = require('express');
const router = express.Router();
const ImportService = require('../../services/import-service');

/**
 * Import form page
 */
router.get('/', async (req, res) => {
  try {
    res.render('admin/import', {
      user: { username: 'demo', role: 'admin' }
    });
  } catch (err) {
    console.error('[import-form]', err);
    res.status(500).render('admin/hub-v2-error', { error: err.message });
  }
});

/**
 * Preview/dry-run import
 * POST body: { csvContent: string }
 * Returns: { summary, stats, preview: { errors, created, skipped } }
 */
router.post('/preview', async (req, res) => {
  try {
    const { csvContent } = req.body;

    if (!csvContent || csvContent.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'CSV content is required'
      });
    }

    // Run import in dry-run mode
    const summary = await ImportService.importFromCSV(csvContent, {
      dryRun: true,
      skipDuplicates: true
    });

    // Get statistics
    const stats = ImportService.getSummaryStats(summary);

    // Prepare preview (limit errors/created for display)
    const preview = {
      errors: summary.errors.slice(0, 10),
      created: summary.created.slice(0, 10),
      skipped: summary.skipped.slice(0, 10),
      hasMoreErrors: summary.errors.length > 10,
      hasMoreCreated: summary.created.length > 10,
      hasMoreSkipped: summary.skipped.length > 10
    };

    res.json({
      success: true,
      stats,
      preview,
      summary: {
        totalRows: summary.totalRows,
        created: summary.created.length,
        skipped: summary.skipped.length,
        errors: summary.errors.length
      }
    });
  } catch (err) {
    console.error('[import-preview]', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * Execute import
 * POST body: { csvContent: string }
 * Returns: { summary, stats, results }
 */
router.post('/execute', async (req, res) => {
  try {
    const { csvContent } = req.body;

    if (!csvContent || csvContent.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'CSV content is required'
      });
    }

    // Run actual import
    const summary = await ImportService.importFromCSV(csvContent, {
      dryRun: false,
      skipDuplicates: true,
      onProgress: (progress) => {
        console.log(`[import] ${progress.current}/${progress.total} - ${progress.status}`);
      }
    });

    // Get statistics
    const stats = ImportService.getSummaryStats(summary);

    // Prepare results (limit for display)
    const results = {
      created: summary.created.slice(0, 20),
      skipped: summary.skipped.slice(0, 20),
      errors: summary.errors.slice(0, 20),
      hasMoreCreated: summary.created.length > 20,
      hasMoreSkipped: summary.skipped.length > 20,
      hasMoreErrors: summary.errors.length > 20
    };

    // Log summary
    console.log(ImportService.formatSummary(summary));

    res.json({
      success: true,
      stats,
      results,
      summary: {
        totalRows: summary.totalRows,
        created: summary.created.length,
        skipped: summary.skipped.length,
        errors: summary.errors.length
      }
    });
  } catch (err) {
    console.error('[import-execute]', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
