// Real reference article, pulled from the live test DPP at
// https://nudie-dpp.vercel.app/01/07311133077016/22/114971-L32-W32
// (2026-09-20) - added specifically to exercise the new field
// data_types (json, repeating_group) end-to-end with real data, the
// same way style 113756/Tuff Tony exercised Transparency originally.
//
// Run against the live dev server (goes through the same admin
// routes the UI uses, not raw SQL) with:
//   node scripts/seed-loud-larry-114971.js
const BASE = 'http://localhost:3000';

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(`${path} failed: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log('Creating style 114971...');
  const styleResult = await postJson('/api/admin/styles', {
    style_number: '114971',
    product_name: 'Loud Larry Dirt Wash',
    product_type: 'Jeans'
  });
  const styleId = styleResult.style.id;
  console.log('  style id:', styleId);

  console.log('Creating GTIN 07311133077016...');
  const gtinResult = await postJson(`/api/admin/styles/${styleId}/gtins`, {
    gtin: '07311133077016',
    item_number: '114971-L32-W32',
    size_value_1: 'W32',
    size_value_2: 'L32'
  });
  const gtinId = gtinResult.gtin.id;
  console.log('  gtin id:', gtinId);

  console.log('Creating batch...');
  const batchResult = await postJson('/admin-v2/batch', {
    batch_id: 'PO-LOUDLARRY-114971',
    production_order: 'PO-LOUDLARRY-114971'
  });
  const batchId = batchResult.batch.id;
  console.log('  batch id:', batchId);

  console.log('Linking GTIN to batch...');
  const batchGtinResult = await postJson('/admin-v2/batch-gtins', {
    batch_id: batchId,
    gtin_id: gtinId,
    planned_quantity: 1
  });
  const batchGtinId = batchGtinResult.id;
  console.log('  batch_gtin id:', batchGtinId);

  console.log('Producing 1 SGTIN...');
  const sgtinResult = await postJson(`/admin-v2/batch-gtins/${batchGtinId}/produce-sgtins`, { quantity: 1 });
  const serialNumber = sgtinResult.created[0].serial_number;
  console.log('  serial:', serialNumber);

  console.log('Setting Style-level field values...');
  const fieldValues = {
    fiber_composition: '100% Cotton',
    country_of_origin: 'Tunisia',
    care_instructions: 'Machine wash 40°. Iron at low temperature. Do not bleach, tumble dry, or dry clean. May dry- or wet bleed. May shrink up to 3%. Please stretch inseam while damp. Wash inside out with similar colors.',
    carbon_footprint: '14.32 kg CO2e',
    water_usage: '821 litres'
  };
  for (const [key, value] of Object.entries(fieldValues)) {
    await postJson(`/api/admin/styles/${styleId}/fields/${key}`, { value });
    console.log('  set', key);
  }

  console.log('Creating "transport" field (data_type=json) if missing...');
  try {
    await postJson('/api/admin/fields', {
      field_key: 'transport',
      label: 'Transport',
      category: 'eu_required',
      data_type: 'json',
      editable_at_style: true,
      editable_at_variant: true,
      editable_at_batch: true,
      editable_at_gtin: false,
      editable_at_sgtin: false
    });
    console.log('  created transport field');
  } catch (e) {
    console.log('  transport field already exists, skipping:', e.message);
  }
  await postJson(`/api/admin/styles/${styleId}/fields/transport`, {
    value: JSON.stringify({ route: 'Tunisia - Italy - Sweden', modes: ['Sea', 'Road'], carrier: 'Alpi' })
  });
  console.log('  set transport');

  console.log('Adding Transparency (supply chain) steps...');
  const journeySteps = [
    { category: 'Raw Material', label: 'Raw material', parties: ['Akasya ltd', 'Egecot Tarim San. Ve Tic. A.s.'] },
    { category: 'Raw Material', label: 'Ginning', parties: ['Akasya ltd', 'Egecot Tarim San. Ve Tic. A.s.'] },
    { category: 'Yarn Process', label: 'Spinning', parties: ['Orta Anadolu'] },
    { category: 'Fabric Process', label: 'Weaving mill', parties: ['Orta Anadolu'] },
    { category: 'Fabric Process', label: 'Fabric supplier', parties: ['Orta Anadolu'] },
    { category: 'Fabric Process', label: 'Fabric dyeing', parties: ['Orta Anadolu'] },
    { category: 'Manufacturing', label: 'Printing', parties: ['Fashion Textile Services'] },
    { category: 'Manufacturing', label: 'Embroidery', parties: ['Denim Authority S.A'] },
    { category: 'Manufacturing', label: 'Assembly', parties: ['Denim Authority S.A'] },
    { category: 'Manufacturing', label: 'Press and packing', parties: ['Denim Authority S.A'] },
    { category: 'Manufacturing', label: 'Supplier', parties: ['Denim Authority S.A'] },
    { category: 'Transportation', label: 'Warehouse', parties: ['Borås, Sweden'] }
  ];
  const trimSteps = [
    { category: 'Trims', label: 'Button', parties: ['Berning +Söhne GMBH & Co. KG'] },
    { category: 'Trims', label: 'Rivet', parties: ['Berning +Söhne GMBH & Co. KG'] },
    { category: 'Trims', label: 'Thread', parties: ['Coats Koban', 'Manifattura Italiana Cucirini Spa'] },
    { category: 'Trims', label: 'Lining', parties: ['Orta Anadolu'] },
    { category: 'Trims', label: 'Jacron Patch', parties: ['ZERO1 s.r.l.'] },
    { category: 'Trims', label: 'Paper Label', parties: ['Trimco Group - Metprint Matbaacilik Ambalaj San.Tic.Ldt.Sti'] },
    { category: 'Trims', label: 'Woven Label', parties: ['Trimco Group - Dizayn Etiket San. Tic A.S.'] }
  ];

  let sortOrder = 0;
  for (const step of [...journeySteps, ...trimSteps]) {
    for (const party of step.parties) {
      const isWarehouse = step.label === 'Warehouse';
      await postJson(`/admin-v2/style/${styleId}/supply-chain`, {
        step_category: step.category,
        step_label: step.label,
        sort_order: sortOrder++,
        supplier_name: isWarehouse ? null : party,
        city: isWarehouse ? party.split(',')[0].trim() : null,
        country: isWarehouse ? party.split(',')[1]?.trim() : null
      });
    }
  }
  console.log('  added', sortOrder, 'supply chain rows');

  console.log('\nDone. Public passport:');
  console.log(`  ${BASE}/01/07311133077016/21/${serialNumber}`);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
