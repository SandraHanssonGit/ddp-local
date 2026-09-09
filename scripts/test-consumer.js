const consumerService = require('../services/consumer-service');

async function test() {
  console.log('\nTesting consumer-service for serial GT-2024-001...\n');

  const result = await consumerService.getConsumerPassportJson('GT-2024-001');

  if (!result) {
    console.log('❌ No result returned');
    process.exit(1);
  }

  console.log('✓ Result received');
  console.log('\nPassport object keys:', Object.keys(result.passport));
  console.log('\nPassport.events:', result.passport.events);
  console.log('Number of events:', result.passport.events ? result.passport.events.length : 0);

  if (result.passport.events && result.passport.events.length > 0) {
    console.log('\n✓ Events found!');
    result.passport.events.forEach((evt, i) => {
      console.log(`  ${i + 1}. type="${evt.type}", label="${evt.label}"`);
    });
  } else {
    console.log('\n❌ No events in passport object');
  }

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
