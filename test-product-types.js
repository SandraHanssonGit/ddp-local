/**
 * Unit Tests: Product Type Configuration
 *
 * Tests the flexible product type system for:
 * - Jeans (Adult)
 * - T-Shirts
 * - Kids Products
 * - No-Size Products
 *
 * Run: npm test -- test-product-types.js
 * Or: node test-product-types.js
 */

const ProductTypeConfig = require('./services/product-type-config');
const assert = require('assert');

let testsPassed = 0;
let testsFailed = 0;

/**
 * Test helper
 */
function test(description, fn) {
  try {
    fn();
    console.log(`✓ ${description}`);
    testsPassed++;
  } catch (error) {
    console.log(`✗ ${description}`);
    console.log(`  Error: ${error.message}`);
    testsFailed++;
  }
}

/**
 * Test suite: Product Type Configuration
 */
console.log('\n=== Product Type Configuration Tests ===\n');

// ============================================================================
// TESTS: getProductType
// ============================================================================
console.log('📋 Test Group: getProductType()\n');

test('Get jeans_adult configuration', () => {
  const config = ProductTypeConfig.getProductType('jeans_adult');
  assert(config, 'Config should exist');
  assert.strictEqual(config.id, 'jeans_adult');
  assert.strictEqual(config.name, 'Adult Jeans');
  assert(config.parse, 'Parser should exist');
  assert(config.item_pattern, 'Pattern should exist');
});

test('Get tshirt configuration', () => {
  const config = ProductTypeConfig.getProductType('tshirt');
  assert(config, 'Config should exist');
  assert.strictEqual(config.id, 'tshirt');
  assert.strictEqual(config.name, 'T-Shirt');
});

test('Get kids configuration', () => {
  const config = ProductTypeConfig.getProductType('kids');
  assert(config, 'Config should exist');
  assert.strictEqual(config.id, 'kids');
});

test('Get no_size configuration', () => {
  const config = ProductTypeConfig.getProductType('no_size');
  assert(config, 'Config should exist');
  assert.strictEqual(config.id, 'no_size');
});

test('Return null for unknown type', () => {
  const config = ProductTypeConfig.getProductType('unknown');
  assert.strictEqual(config, null);
});

test('Return null for invalid input', () => {
  const config1 = ProductTypeConfig.getProductType(null);
  const config2 = ProductTypeConfig.getProductType(undefined);
  const config3 = ProductTypeConfig.getProductType('');
  assert.strictEqual(config1, null);
  assert.strictEqual(config2, null);
  assert.strictEqual(config3, null);
});

// ============================================================================
// TESTS: listProductTypes
// ============================================================================
console.log('\n📋 Test Group: listProductTypes()\n');

test('List all product types', () => {
  const types = ProductTypeConfig.listProductTypes();
  assert(Array.isArray(types), 'Should return array');
  assert.strictEqual(types.length, 4);
  assert(types.includes('jeans_adult'));
  assert(types.includes('tshirt'));
  assert(types.includes('kids'));
  assert(types.includes('no_size'));
});

// ============================================================================
// TESTS: parseItemNumber - JEANS ADULT
// ============================================================================
console.log('\n📋 Test Group: parseItemNumber() - JEANS ADULT\n');

test('Parse valid jeans item number: 112327-L30-W24', () => {
  const parsed = ProductTypeConfig.parseItemNumber('112327-L30-W24', 'jeans_adult');
  assert(parsed, 'Should parse successfully');
  assert.strictEqual(parsed.style_number, '112327');
  assert.strictEqual(parsed.length, '30');
  assert.strictEqual(parsed.waist, '24');
  assert.strictEqual(parsed.size_value_1, '30');
  assert.strictEqual(parsed.size_value_2, '24');
  assert.strictEqual(parsed.display, 'L30-W24');
});

test('Parse another valid jeans item number: 114519-L32-W28', () => {
  const parsed = ProductTypeConfig.parseItemNumber('114519-L32-W28', 'jeans_adult');
  assert(parsed, 'Should parse successfully');
  assert.strictEqual(parsed.style_number, '114519');
  assert.strictEqual(parsed.length, '32');
  assert.strictEqual(parsed.waist, '28');
});

test('Reject invalid jeans format: missing waist', () => {
  const parsed = ProductTypeConfig.parseItemNumber('112327-L30', 'jeans_adult');
  assert.strictEqual(parsed, null);
});

test('Reject invalid jeans format: missing length', () => {
  const parsed = ProductTypeConfig.parseItemNumber('112327-W24', 'jeans_adult');
  assert.strictEqual(parsed, null);
});

test('Reject invalid jeans format: wrong separator', () => {
  const parsed = ProductTypeConfig.parseItemNumber('112327_L30_W24', 'jeans_adult');
  assert.strictEqual(parsed, null);
});

// ============================================================================
// TESTS: parseItemNumber - T-SHIRT
// ============================================================================
console.log('\n📋 Test Group: parseItemNumber() - T-SHIRT\n');

test('Parse valid tshirt item number: 131274-B01-003', () => {
  const parsed = ProductTypeConfig.parseItemNumber('131274-B01-003', 'tshirt');
  assert(parsed, 'Should parse successfully');
  assert.strictEqual(parsed.style_number, '131274');
  assert.strictEqual(parsed.variant, 'B01');
  assert.strictEqual(parsed.size_code, '003');
  assert.strictEqual(parsed.size, 'M');
  assert.strictEqual(parsed.size_label, 'Medium');
  assert.strictEqual(parsed.size_value_1, 'M');
  assert.strictEqual(parsed.size_value_2, 'B01');
  assert.strictEqual(parsed.display, 'M (B01)');
});

test('Parse tshirt size 001 (XS)', () => {
  const parsed = ProductTypeConfig.parseItemNumber('131274-B01-001', 'tshirt');
  assert.strictEqual(parsed.size, 'XS');
  assert.strictEqual(parsed.size_label, 'Extra Small');
});

test('Parse tshirt size 005 (XL)', () => {
  const parsed = ProductTypeConfig.parseItemNumber('131274-B01-005', 'tshirt');
  assert.strictEqual(parsed.size, 'XL');
  assert.strictEqual(parsed.size_label, 'Extra Large');
});

test('Reject invalid tshirt format: wrong variant code', () => {
  const parsed = ProductTypeConfig.parseItemNumber('131274-001-003', 'tshirt');
  assert.strictEqual(parsed, null);
});

test('Reject invalid tshirt format: wrong size code length', () => {
  const parsed = ProductTypeConfig.parseItemNumber('131274-B01-03', 'tshirt');
  assert.strictEqual(parsed, null);
});

// ============================================================================
// TESTS: parseItemNumber - KIDS
// ============================================================================
console.log('\n📋 Test Group: parseItemNumber() - KIDS\n');

test('Parse valid kids item number: 910006-B26-K10', () => {
  const parsed = ProductTypeConfig.parseItemNumber('910006-B26-K10', 'kids');
  assert(parsed, 'Should parse successfully');
  assert.strictEqual(parsed.style_number, '910006');
  assert.strictEqual(parsed.variant, 'B26');
  assert.strictEqual(parsed.kid_size, '10');
  assert.strictEqual(parsed.kid_size_label, 'Age 10');
  assert.strictEqual(parsed.size_value_1, '10');
  assert.strictEqual(parsed.size_value_2, 'B26');
  assert.strictEqual(parsed.display, 'K10 (B26)');
});

test('Parse kids all sizes', () => {
  const sizes = ['K07', 'K08', 'K10', 'K12', 'K14'];
  for (const size of sizes) {
    const parsed = ProductTypeConfig.parseItemNumber(`910006-B26-${size}`, 'kids');
    assert(parsed, `Should parse ${size}`);
  }
});

test('Reject invalid kids format: missing variant', () => {
  const parsed = ProductTypeConfig.parseItemNumber('910006-K10', 'kids');
  assert.strictEqual(parsed, null);
});

// ============================================================================
// TESTS: parseItemNumber - NO SIZE
// ============================================================================
console.log('\n📋 Test Group: parseItemNumber() - NO SIZE\n');

test('Parse no-size item number with variant: XXXXX-YYY', () => {
  const parsed = ProductTypeConfig.parseItemNumber('550001-ABC', 'no_size');
  assert(parsed, 'Should parse successfully');
  assert.strictEqual(parsed.style_number, '550001');
  assert.strictEqual(parsed.variant, 'ABC');
  assert.strictEqual(parsed.size_value_1, null);
  assert.strictEqual(parsed.size_value_2, null);
  assert.strictEqual(parsed.display, 'One Size');
});

test('Parse no-size item number without variant: XXXXX', () => {
  const parsed = ProductTypeConfig.parseItemNumber('550001', 'no_size');
  assert(parsed, 'Should parse successfully');
  assert.strictEqual(parsed.style_number, '550001');
  assert.strictEqual(parsed.variant, null);
});

// ============================================================================
// TESTS: detectProductType
// ============================================================================
console.log('\n📋 Test Group: detectProductType()\n');

test('Detect jeans_adult from item number', () => {
  const result = ProductTypeConfig.detectProductType('112327-L30-W24');
  assert.strictEqual(result.type, 'jeans_adult');
  assert.strictEqual(result.confidence, 1.0);
});

test('Detect tshirt from item number', () => {
  const result = ProductTypeConfig.detectProductType('131274-B01-003');
  assert.strictEqual(result.type, 'tshirt');
  assert.strictEqual(result.confidence, 1.0);
});

test('Detect kids from item number', () => {
  const result = ProductTypeConfig.detectProductType('910006-B26-K10');
  assert.strictEqual(result.type, 'kids');
  assert.strictEqual(result.confidence, 1.0);
});

test('Detect no_size from item number', () => {
  const result = ProductTypeConfig.detectProductType('550001-ABC');
  assert.strictEqual(result.type, 'no_size');
  assert.strictEqual(result.confidence, 1.0);
});

test('Return zero confidence for unmatched item number', () => {
  const result = ProductTypeConfig.detectProductType('INVALID-XYZ-123-ABC');
  assert.strictEqual(result.type, null);
  assert.strictEqual(result.confidence, 0);
});

test('Handle null/undefined input gracefully', () => {
  const result1 = ProductTypeConfig.detectProductType(null);
  const result2 = ProductTypeConfig.detectProductType(undefined);
  assert.strictEqual(result1.type, null);
  assert.strictEqual(result2.type, null);
});

// ============================================================================
// TESTS: getDisplaySize
// ============================================================================
console.log('\n📋 Test Group: getDisplaySize()\n');

test('Display jeans size', () => {
  const gtin = { product_type: 'jeans_adult', size_value_1: '30', size_value_2: '24' };
  const display = ProductTypeConfig.getDisplaySize(gtin);
  assert.strictEqual(display, 'L30-W24');
});

test('Display tshirt size', () => {
  const gtin = { product_type: 'tshirt', size_value_1: 'M', size_value_2: 'B01' };
  const display = ProductTypeConfig.getDisplaySize(gtin);
  assert.strictEqual(display, 'M (B01)');
});

test('Display kids size', () => {
  const gtin = { product_type: 'kids', size_value_1: '10', size_value_2: 'B26' };
  const display = ProductTypeConfig.getDisplaySize(gtin);
  assert.strictEqual(display, 'K10 (B26)');
});

test('Display no-size size', () => {
  const gtin = { product_type: 'no_size', size_value_1: null, size_value_2: null };
  const display = ProductTypeConfig.getDisplaySize(gtin);
  assert.strictEqual(display, 'One Size');
});

test('Display legacy size with both values', () => {
  const gtin = { product_type: 'legacy', size_value_1: '30', size_value_2: 'Blue' };
  const display = ProductTypeConfig.getDisplaySize(gtin);
  assert.strictEqual(display, '30-Blue');
});

test('Handle null gtin gracefully', () => {
  const display = ProductTypeConfig.getDisplaySize(null);
  assert.strictEqual(display, 'Unknown');
});

// ============================================================================
// TESTS: validateSize
// ============================================================================
console.log('\n📋 Test Group: validateSize()\n');

test('Validate correct jeans size', () => {
  const result = ProductTypeConfig.validateSize({ length: '30', waist: '24' }, 'jeans_adult');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('Reject jeans without length', () => {
  const result = ProductTypeConfig.validateSize({ waist: '24' }, 'jeans_adult');
  assert.strictEqual(result.valid, false);
  assert(result.errors.some(e => e.includes('Length')));
});

test('Reject jeans without waist', () => {
  const result = ProductTypeConfig.validateSize({ length: '30' }, 'jeans_adult');
  assert.strictEqual(result.valid, false);
  assert(result.errors.some(e => e.includes('Waist')));
});

test('Reject jeans with invalid length range', () => {
  const result = ProductTypeConfig.validateSize({ length: '100', waist: '24' }, 'jeans_adult');
  assert.strictEqual(result.valid, false);
  assert(result.errors.some(e => e.includes('Length')));
});

test('Validate correct tshirt size', () => {
  const result = ProductTypeConfig.validateSize({ size: 'M' }, 'tshirt');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('Reject tshirt with invalid size', () => {
  const result = ProductTypeConfig.validateSize({ size: 'XXL' }, 'tshirt');
  assert.strictEqual(result.valid, false);
  assert(result.errors.some(e => e.includes('Size')));
});

test('Validate tshirt with optional variant', () => {
  const result = ProductTypeConfig.validateSize({ size: 'M', variant: 'B01' }, 'tshirt');
  assert.strictEqual(result.valid, true);
});

test('Reject tshirt with invalid variant format', () => {
  const result = ProductTypeConfig.validateSize({ size: 'M', variant: 'invalid' }, 'tshirt');
  assert.strictEqual(result.valid, false);
  assert(result.errors.some(e => e.includes('Variant')));
});

test('Validate correct kids size', () => {
  const result = ProductTypeConfig.validateSize({ kid_size: '10' }, 'kids');
  assert.strictEqual(result.valid, true);
});

test('Reject kids with invalid kid_size', () => {
  const result = ProductTypeConfig.validateSize({ kid_size: '15' }, 'kids');
  assert.strictEqual(result.valid, false);
  assert(result.errors.some(e => e.includes('Kid size')));
});

test('Validate no_size has no errors', () => {
  const result = ProductTypeConfig.validateSize({}, 'no_size');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('Reject unknown product type', () => {
  const result = ProductTypeConfig.validateSize({}, 'unknown_type');
  assert.strictEqual(result.valid, false);
  assert(result.errors.some(e => e.includes('Unknown')));
});

// ============================================================================
// TESTS: getSizeComponentTemplate
// ============================================================================
console.log('\n📋 Test Group: getSizeComponentTemplate()\n');

test('Get jeans component template', () => {
  const template = ProductTypeConfig.getSizeComponentTemplate('jeans_adult');
  assert.strictEqual(template.length, 2);
  assert.strictEqual(template[0].name, 'length');
  assert.strictEqual(template[1].name, 'waist');
  assert.strictEqual(template[0].required, true);
  assert.strictEqual(template[1].required, true);
});

test('Get tshirt component template', () => {
  const template = ProductTypeConfig.getSizeComponentTemplate('tshirt');
  assert.strictEqual(template.length, 2);
  assert.strictEqual(template[0].name, 'size');
  assert.strictEqual(template[1].name, 'variant');
  assert.strictEqual(template[0].required, true);
  assert.strictEqual(template[1].required, false);
});

test('Get kids component template', () => {
  const template = ProductTypeConfig.getSizeComponentTemplate('kids');
  assert.strictEqual(template.length, 2);
  assert.strictEqual(template[0].name, 'kid_size');
  assert.strictEqual(template[1].name, 'variant');
});

test('Get no_size component template', () => {
  const template = ProductTypeConfig.getSizeComponentTemplate('no_size');
  assert.strictEqual(template.length, 1);
  assert.strictEqual(template[0].name, 'variant');
  assert.strictEqual(template[0].required, false);
});

test('Return empty array for unknown type', () => {
  const template = ProductTypeConfig.getSizeComponentTemplate('unknown');
  assert.strictEqual(template.length, 0);
});

// ============================================================================
// TESTS: Edge Cases and Integration
// ============================================================================
console.log('\n📋 Test Group: Edge Cases & Integration\n');

test('Parse and validate jeans in sequence', () => {
  const parsed = ProductTypeConfig.parseItemNumber('112327-L30-W24', 'jeans_adult');
  const validation = ProductTypeConfig.validateSize(
    { length: parsed.length, waist: parsed.waist },
    'jeans_adult'
  );
  assert.strictEqual(validation.valid, true);
});

test('Detect, parse, and display tshirt in sequence', () => {
  const detected = ProductTypeConfig.detectProductType('131274-B01-003');
  assert.strictEqual(detected.type, 'tshirt');

  const parsed = ProductTypeConfig.parseItemNumber('131274-B01-003', detected.type);
  assert(parsed);

  const gtin = {
    product_type: detected.type,
    size_value_1: parsed.size_value_1,
    size_value_2: parsed.size_value_2,
  };

  const display = ProductTypeConfig.getDisplaySize(gtin);
  assert.strictEqual(display, 'M (B01)');
});

test('Handle case-insensitive size (tshirt)', () => {
  const template = ProductTypeConfig.getSizeComponentTemplate('tshirt');
  const sizeField = template.find(t => t.name === 'size');
  assert(sizeField.options.includes('M'));
  assert(sizeField.options.includes('XL'));
});

// ============================================================================
// Test Summary
// ============================================================================
console.log('\n═══════════════════════════════════════════════════════════\n');
console.log(`✓ Passed: ${testsPassed}`);
console.log(`✗ Failed: ${testsFailed}`);
console.log(`Total:   ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  console.log('\n❌ Some tests failed');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
