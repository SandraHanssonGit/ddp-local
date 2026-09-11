const db = require('../db/init-v2');
const sgtinRepository = require('../repositories/sgtins');

class LifecycleService {
  /**
   * Valid lifecycle event types
   */
  static VALID_EVENT_TYPES = [
    'manufactured',
    'quality_checked',
    'packaged',
    'shipped',
    'delivered',
    'sold',
    'worn',
    'repaired',
    'resold',
    'returned',
    'recycled',
    'other'
  ];

  /**
   * Add a lifecycle event for an SGTIN
   */
  async addEvent(sgtinId, eventType, eventData = {}, options = {}) {
    // Validate SGTIN exists
    const sgtin = await sgtinRepository.getById(sgtinId);
    if (!sgtin) {
      throw new Error(`SGTIN ${sgtinId} not found`);
    }

    // Validate event type
    if (!LifecycleService.VALID_EVENT_TYPES.includes(eventType)) {
      throw new Error(`Invalid event type. Must be one of: ${LifecycleService.VALID_EVENT_TYPES.join(', ')}`);
    }

    const sourceSystem = options.sourceSystem || 'manual';
    const createdBy = options.createdBy || null;

    // Convert event data to JSON string
    const eventDataJson = JSON.stringify(eventData);

    const sql = `
      INSERT INTO lifecycle_events
      (sgtin_id, event_type, event_data, source_system, created_by)
      VALUES (?, ?, ?, ?, ?)
    `;

    const result = await db.run(sql, [
      sgtinId,
      eventType,
      eventDataJson,
      sourceSystem,
      createdBy
    ]);

    return {
      id: result.lastID,
      sgtin_id: sgtinId,
      event_type: eventType,
      event_data: eventData,
      source_system: sourceSystem,
      created_by: createdBy,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Get all events for an SGTIN
   */
  async getEvents(sgtinId) {
    const sql = `
      SELECT * FROM lifecycle_events
      WHERE sgtin_id = ?
      ORDER BY created_at ASC
    `;

    const rows = await db.all(sql, [sgtinId]);

    // Parse JSON event_data
    return rows.map(row => ({
      ...row,
      event_data: row.event_data ? JSON.parse(row.event_data) : {}
    }));
  }

  /**
   * Get events by type for an SGTIN
   */
  async getEventsByType(sgtinId, eventType) {
    const sql = `
      SELECT * FROM lifecycle_events
      WHERE sgtin_id = ? AND event_type = ?
      ORDER BY created_at ASC
    `;

    const rows = await db.all(sql, [sgtinId, eventType]);

    return rows.map(row => ({
      ...row,
      event_data: row.event_data ? JSON.parse(row.event_data) : {}
    }));
  }

  /**
   * Get recent events (across all SGTINs)
   */
  async getRecentEvents(limit = 50) {
    const sql = `
      SELECT
        le.*,
        s.serial_number,
        s.sgtin,
        b.batch_id,
        st.style_number
      FROM lifecycle_events le
      JOIN sgtins s ON le.sgtin_id = s.id
      JOIN gtins g ON s.gtin_id = g.id
      JOIN batches b ON b.id = s.batch_id
      JOIN styles st ON st.id = g.style_id
      ORDER BY le.created_at DESC
      LIMIT ?
    `;

    const rows = await db.all(sql, [limit]);

    return rows.map(row => ({
      ...row,
      event_data: row.event_data ? JSON.parse(row.event_data) : {}
    }));
  }

  /**
   * Get event summary for an SGTIN
   */
  async getEventSummary(sgtinId) {
    const sql = `
      SELECT
        event_type,
        COUNT(*) as count,
        MIN(created_at) as first_occurrence,
        MAX(created_at) as last_occurrence
      FROM lifecycle_events
      WHERE sgtin_id = ?
      GROUP BY event_type
      ORDER BY event_type ASC
    `;

    return db.all(sql, [sgtinId]);
  }

  /**
   * Get timeline of events
   */
  async getEventTimeline(sgtinId) {
    const events = await this.getEvents(sgtinId);

    return {
      sgtin_id: sgtinId,
      total_events: events.length,
      timeline: events.map((event, index) => ({
        sequence: index + 1,
        event_type: event.event_type,
        event_data: event.event_data,
        created_at: event.created_at,
        source_system: event.source_system,
        created_by: event.created_by
      }))
    };
  }

  /**
   * Get formatted event description for display
   */
  formatEventForDisplay(event) {
    const eventDescriptions = {
      manufactured: 'Manufactured',
      quality_checked: 'Quality Checked',
      packaged: 'Packaged',
      shipped: 'Shipped',
      delivered: 'Delivered',
      sold: 'Sold',
      worn: 'In Use',
      repaired: 'Repaired',
      resold: 'Resold',
      returned: 'Returned',
      recycled: 'Recycled'
    };

    return {
      label: eventDescriptions[event.event_type] || event.event_type,
      type: event.event_type,
      date: event.created_at,
      details: event.event_data
    };
  }

  /**
   * Get events for passport display
   */
  async getEventsForPassport(sgtinId) {
    const events = await this.getEvents(sgtinId);
    return events.map(event => this.formatEventForDisplay(event));
  }
}

module.exports = new LifecycleService();
