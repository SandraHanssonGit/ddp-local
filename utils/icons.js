const fs = require('fs');
const path = require('path');

// Lucide icons (2026-09-19 design decision) - inline SVG read from
// lucide-static, not the JS/CDN version, so there's no runtime
// dependency, no CSP change, and no client-side init call needed
// (matches the project's "minimal native JavaScript" preference).
// Cached per icon name since the SVG source files never change while
// the server is running.
const ICONS_DIR = path.join(__dirname, '../node_modules/lucide-static/icons');
const cache = {};

function icon(name, options = {}) {
  if (!cache[name]) {
    const filePath = path.join(ICONS_DIR, `${name}.svg`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Unknown Lucide icon: ${name}`);
    }
    cache[name] = fs.readFileSync(filePath, 'utf8');
  }

  const size = options.size || 16;
  let svg = cache[name]
    .replace(/^<!--.*?-->\s*/s, '')
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`);

  if (options.class) {
    svg = svg.replace('class="lucide', `class="${options.class} lucide`);
  }

  return svg;
}

module.exports = { icon };
