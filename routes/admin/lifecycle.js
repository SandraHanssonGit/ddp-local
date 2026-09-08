const express = require('express');
const router = express.Router();
const lifecycleService = require('../../services/lifecycle-service');

// Add event to an SGTIN
router.post('/:sgtinId/events', async (req, res) => {
  try {
    const { event_type, event_data, created_by } = req.body;

    if (!event_type) {
      return res.status(400).json({ success: false, error: 'event_type is required' });
    }

    const event = await lifecycleService.addEvent(
      parseInt(req.params.sgtinId),
      event_type,
      event_data || {},
      { created_by }
    );

    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all events for an SGTIN
router.get('/:sgtinId/events', async (req, res) => {
  try {
    const events = await lifecycleService.getEvents(parseInt(req.params.sgtinId));
    res.json({ success: true, sgtinId: req.params.sgtinId, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get events by type for an SGTIN
router.get('/:sgtinId/events/:eventType', async (req, res) => {
  try {
    const events = await lifecycleService.getEventsByType(
      parseInt(req.params.sgtinId),
      req.params.eventType
    );
    res.json({ success: true, sgtinId: req.params.sgtinId, eventType: req.params.eventType, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get event summary for an SGTIN
router.get('/:sgtinId/summary', async (req, res) => {
  try {
    const summary = await lifecycleService.getEventSummary(parseInt(req.params.sgtinId));
    res.json({ success: true, sgtinId: req.params.sgtinId, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get event timeline for an SGTIN
router.get('/:sgtinId/timeline', async (req, res) => {
  try {
    const timeline = await lifecycleService.getEventTimeline(parseInt(req.params.sgtinId));
    res.json({ success: true, timeline });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get recent events across all SGTINs
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const events = await lifecycleService.getRecentEvents(limit);
    res.json({ success: true, limit, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Valid event types endpoint
router.get('/types/list', async (req, res) => {
  res.json({
    success: true,
    eventTypes: lifecycleService.constructor.VALID_EVENT_TYPES
  });
});

module.exports = router;
