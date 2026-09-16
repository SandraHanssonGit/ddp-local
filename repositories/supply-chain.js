const db = require('../db/init-v2');

// See ROADMAP.md "Supply Chain data structure" - a repeating list of
// named process steps (Raw Material, Spinning, Weaving Mill, ...),
// each with a supplier. Deliberately separate from
// field_definitions/dpp_values, which only holds one scalar value per
// field per level.
class SupplyChainRepository {
  async listForEntity(entityType, entityId) {
    const sql = `
      SELECT * FROM supply_chain_steps
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY sort_order ASC, id ASC
    `;
    return db.all(sql, [entityType, entityId]);
  }

  async getById(id) {
    return db.get(`SELECT * FROM supply_chain_steps WHERE id = ?`, [id]);
  }

  async create(entityType, entityId, data) {
    const sql = `
      INSERT INTO supply_chain_steps
        (entity_type, entity_id, step_category, step_label, sort_order,
         supplier_name, city, country, employee_range, visited_by_brand)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await db.run(sql, [
      entityType,
      entityId,
      data.step_category,
      data.step_label,
      data.sort_order || 0,
      data.supplier_name || null,
      data.city || null,
      data.country || null,
      data.employee_range || null,
      data.visited_by_brand ? 1 : 0
    ]);
    return result.lastID;
  }

  async update(id, updates) {
    const allowedFields = ['step_category', 'step_label', 'sort_order', 'supplier_name', 'city', 'country', 'employee_range', 'visited_by_brand'];
    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.includes(key)) continue;
      setClauses.push(`${key} = ?`);
      values.push(key === 'visited_by_brand' ? (value ? 1 : 0) : value);
    }

    if (setClauses.length === 0) return;

    values.push(id);
    const sql = `UPDATE supply_chain_steps SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await db.run(sql, values);
  }

  async delete(id) {
    await db.run(`DELETE FROM supply_chain_steps WHERE id = ?`, [id]);
  }

  // Grouped by step_category, in the order categories first appear -
  // matches how the real Transparency panel groups steps for display.
  async getGroupedForEntity(entityType, entityId) {
    const steps = await this.listForEntity(entityType, entityId);
    const groups = [];
    const byCategory = new Map();

    for (const step of steps) {
      if (!byCategory.has(step.step_category)) {
        const group = { category: step.step_category, steps: [] };
        byCategory.set(step.step_category, group);
        groups.push(group);
      }
      byCategory.get(step.step_category).steps.push(step);
    }

    return groups;
  }
}

module.exports = new SupplyChainRepository();
