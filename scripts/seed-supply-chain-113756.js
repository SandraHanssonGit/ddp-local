// Reference test article for ROADMAP.md's Supply Chain data structure -
// real data from nudiejeans.com/113756 (Tuff Tony Dry Selvage), used to
// visually compare the DPP passport's Supply Chain section against the
// real site.
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.DB_PATH || 'data/dpp-v2.db';
const db = new sqlite3.Database(DB_PATH);

const run = (sql, params) => new Promise((res, rej) => db.run(sql, params, function (err) { if (err) rej(err); else res(this); }));
const get = (sql, params) => new Promise((res, rej) => db.get(sql, params, (err, row) => (err ? rej(err) : res(row))));

const STEPS = [
  { cat: 'Raw Material', label: 'Supplier', supplier: 'UCAK Tekstil AS', city: 'Söke', country: 'Turkey', emp: 'Missing info', visited: false },
  { cat: 'Raw Material', label: 'Ginning', supplier: 'UCAK Tekstil AS', city: 'Söke', country: 'Turkey', emp: 'Missing info', visited: false },
  { cat: 'Yarn Process', label: 'Spinning', supplier: 'Kaihara Ayabe and Kisa Mill', city: null, country: 'Japan', emp: null, visited: false },
  { cat: 'Fabric Process', label: 'Weaving Mill', supplier: 'Kaihara Joge Mill', city: 'Fuchu', country: 'Japan', emp: null, visited: false },
  { cat: 'Fabric Process', label: 'Fabric Dying', supplier: 'Kaihara Main Mill', city: 'Fukuyama', country: 'Japan', emp: null, visited: false },
  { cat: 'Fabric Process', label: 'Fabric Supplier', supplier: 'Kaihara Denim', city: 'Fukuyama City', country: 'Japan', emp: '501-1000', visited: false },
  { cat: 'Trims', label: 'Lining Supplier', supplier: 'Orta Anadolu', city: 'Kayseri', country: 'Türkiye', emp: '1000-2000', visited: true },
  { cat: 'Trims', label: 'Thread Supplier', supplier: 'Coats Romania SRL', city: 'Odorheiu Secuiesc', country: 'Romania', emp: null, visited: false },
  { cat: 'Trims', label: 'Thread Supplier, second', supplier: 'Manifattura Italiana Cucirini Spa', city: 'Cene', country: 'Italy', emp: null, visited: false },
  { cat: 'Trims', label: 'Button Supplier', supplier: 'Berning +Söhne GMBH & Co. KG', city: 'Wuppertal', country: 'Germany', emp: '51-100', visited: true },
  { cat: 'Trims', label: 'Rivet Supplier', supplier: 'Berning +Söhne GMBH & Co. KG', city: 'Wuppertal', country: 'Germany', emp: '51-100', visited: true },
  { cat: 'Trims', label: 'Paper Label Supplier', supplier: 'Trimco Group - Metprint Matbaacilik Ambalaj San.Tic.Ldt.Sti', city: 'Istanbul/Ziya Gökalp', country: 'Türkiye', emp: null, visited: true },
  { cat: 'Trims', label: 'Woven Label Supplier', supplier: 'Trimco Group - Dizayn Etiket San. Tic A.S.', city: 'Istanbul', country: 'Türkiye', emp: null, visited: true },
  { cat: 'Manufacturing', label: 'Embroiderer', supplier: "Jeanious Srls", city: "Sant'Omero", country: 'Italy', emp: '26-50', visited: true },
  { cat: 'Manufacturing', label: 'Printer', supplier: 'S.T.M Italia', city: 'Stella di Monsampolo', country: 'Italy', emp: '0-25', visited: true },
  { cat: 'Manufacturing', label: 'Assembly', supplier: "Jeanious Srls", city: "Sant'Omero", country: 'Italy', emp: '26-50', visited: true },
  { cat: 'Manufacturing', label: 'Press & Packing Unit', supplier: 'Alternative Fashion Srl / SM3', city: 'Cagli', country: 'Italy', emp: '0-25', visited: true },
  { cat: 'Supplier', label: 'Supplier', supplier: 'C&S SRL', city: 'Perugia', country: 'Italy', emp: '51-100', visited: true },
  { cat: 'Transportation', label: 'Warehouse', supplier: null, city: 'Borås', country: 'Sweden', emp: null, visited: false }
];

(async () => {
  await run(`INSERT OR IGNORE INTO styles (style_number, product_name, product_type) VALUES (?, ?, ?)`,
    ['113756', 'Tuff Tony Dry Selvage', 'Jeans']);
  const style = await get('SELECT id FROM styles WHERE style_number = ?', ['113756']);
  console.log('style id:', style.id);

  let order = 0;
  for (const s of STEPS) {
    await run(
      `INSERT INTO supply_chain_steps (entity_type, entity_id, step_category, step_label, sort_order, supplier_name, city, country, employee_range, visited_by_brand)
       VALUES ('style', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [style.id, s.cat, s.label, order++, s.supplier, s.city, s.country, s.emp, s.visited ? 1 : 0]
    );
  }
  console.log('Inserted', STEPS.length, 'supply chain steps for style', style.id);
  db.close();
})().catch(e => { console.error(e); process.exit(1); });
