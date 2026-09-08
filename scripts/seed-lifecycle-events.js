const lifecycleService = require('../services/lifecycle-service');

async function seedLifecycleEvents() {
  console.log('\n[LIFECYCLE SEED] Starting lifecycle events seed\n');

  try {
    // SGTIN ABC001 - Full lifecycle (manufactured → sold → repaired)
    console.log('[LIFECYCLE] Adding events to SGTIN ABC001...');

    await lifecycleService.addEvent(1, 'manufactured', {
      factory: 'Stockholm',
      date: '2026-08-15',
      batch: 'PO45001234'
    });

    await lifecycleService.addEvent(1, 'quality_checked', {
      result: 'pass',
      inspector: 'QC-001'
    });

    await lifecycleService.addEvent(1, 'packaged', {
      package_type: 'Standard Box',
      weight: '450g'
    });

    await lifecycleService.addEvent(1, 'shipped', {
      carrier: 'DHL',
      tracking: 'DHL123456789',
      from: 'Sweden',
      to: 'USA'
    });

    await lifecycleService.addEvent(1, 'delivered', {
      date: '2026-08-22',
      location: 'New York, USA'
    });

    await lifecycleService.addEvent(1, 'sold', {
      retailer: 'Nudie Jeans Store NYC',
      price: '$99.99',
      customer_id: 'CUST-12345'
    });

    await lifecycleService.addEvent(1, 'worn', {
      days_since_purchase: 120,
      condition: 'Good'
    });

    await lifecycleService.addEvent(1, 'repaired', {
      issue: 'Small tear in left thigh',
      cost: '$25',
      repair_center: 'Nudie Repair Service NYC',
      date: '2026-12-01'
    });

    console.log('[LIFECYCLE] ✓ 8 events added to ABC001\n');

    // SGTIN ABC002 - Recent purchase
    console.log('[LIFECYCLE] Adding events to SGTIN ABC002...');

    await lifecycleService.addEvent(2, 'manufactured', {
      factory: 'Stockholm',
      date: '2026-08-15',
      batch: 'PO45001234'
    });

    await lifecycleService.addEvent(2, 'quality_checked', {
      result: 'pass',
      inspector: 'QC-001'
    });

    await lifecycleService.addEvent(2, 'packaged', {
      package_type: 'Standard Box'
    });

    await lifecycleService.addEvent(2, 'shipped', {
      carrier: 'DHL',
      tracking: 'DHL987654321'
    });

    await lifecycleService.addEvent(2, 'delivered', {
      date: '2026-09-01',
      location: 'Los Angeles, USA'
    });

    await lifecycleService.addEvent(2, 'sold', {
      retailer: 'Nudie Jeans Store LA',
      price: '$99.99',
      date: '2026-09-02'
    });

    console.log('[LIFECYCLE] ✓ 6 events added to ABC002\n');

    // SGTIN ABC004 - Recycling flow
    console.log('[LIFECYCLE] Adding events to SGTIN ABC004...');

    await lifecycleService.addEvent(4, 'manufactured', {
      factory: 'Gothenburg',
      date: '2026-09-01',
      batch: 'PO45001345'
    });

    await lifecycleService.addEvent(4, 'quality_checked', {
      result: 'pass',
      inspector: 'QC-002'
    });

    await lifecycleService.addEvent(4, 'shipped', {
      carrier: 'DHL',
      tracking: 'DHL555555555'
    });

    await lifecycleService.addEvent(4, 'sold', {
      retailer: 'Nudie Jeans Store Stockholm',
      price: '$99.99'
    });

    await lifecycleService.addEvent(4, 'worn', {
      days_since_purchase: 60,
      condition: 'Fair'
    });

    await lifecycleService.addEvent(4, 'returned', {
      reason: 'Personal fit preference',
      date: '2026-10-01',
      condition: 'Good'
    });

    await lifecycleService.addEvent(4, 'recycled', {
      facility: 'Återvinning Västra, Sweden',
      date: '2026-10-15',
      material_grade: 'Grade A',
      notes: 'Suitable for regenerated fiber production'
    });

    console.log('[LIFECYCLE] ✓ 7 events added to ABC004\n');

    console.log('[LIFECYCLE] ✅ Lifecycle events seeding complete!\n');
    console.log('[LIFECYCLE] Event Summary:');
    console.log('  ABC001: 8 events (Full lifecycle with repair)');
    console.log('  ABC002: 6 events (Recent purchase)');
    console.log('  ABC004: 7 events (Recycling flow)');
    console.log('  Total: 21 lifecycle events\n');

  } catch (error) {
    console.error('[LIFECYCLE] ❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedLifecycleEvents().then(() => {
    process.exit(0);
  });
}

module.exports = seedLifecycleEvents;
