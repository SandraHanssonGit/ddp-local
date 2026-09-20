const fs = require('fs');
const path = require('path');

// Curated icon set for configurable passport sections (2026-09-20).
// Deliberately a fixed key -> Lucide-file lookup, not free-form
// SVG/HTML text stored in the DB - the admin API has no auth (see the
// Security note in ROADMAP.md), so accepting arbitrary markup there
// would be an open injection point on a page every consumer loads.
// Source SVGs come from the already-installed lucide-static package
// (same source utils/icons.js reads), stripped down to just the inner
// <path>/<circle> markup so dpp-passport.ejs can wrap it in its own
// <svg class="icon"> (matching stroke-width/color via its own CSS)
// instead of Lucide's own default styling.
const ICONS_DIR = path.join(__dirname, '../node_modules/lucide-static/icons');

const SECTION_ICON_OPTIONS = [
  { key: 'shirt', label: 'Shirt' },
  { key: 'route', label: 'Route' },
  { key: 'leaf', label: 'Leaf' },
  { key: 'truck', label: 'Truck' },
  { key: 'link', label: 'Link' },
  { key: 'recycle', label: 'Recycle' },
  { key: 'droplet', label: 'Droplet' },
  { key: 'globe', label: 'Globe' },
  { key: 'factory', label: 'Factory' },
  { key: 'tag', label: 'Tag' },
  { key: 'package', label: 'Package' },
  { key: 'scale', label: 'Scale' }
];

const VALID_KEYS = new Set(SECTION_ICON_OPTIONS.map(o => o.key));
const innerCache = {};

function getSectionIconInner(key) {
  const safeKey = VALID_KEYS.has(key) ? key : 'tag';
  if (!innerCache[safeKey]) {
    const raw = fs.readFileSync(path.join(ICONS_DIR, `${safeKey}.svg`), 'utf8');
    const match = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    innerCache[safeKey] = match ? match[1].trim() : '';
  }
  return innerCache[safeKey];
}

module.exports = { SECTION_ICON_OPTIONS, getSectionIconInner };
