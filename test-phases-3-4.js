/**
 * Test Suite for Phases 3 & 4 Implementation
 * - Phase 3: Import Service
 * - Phase 4: Admin UI - GTIN Detail Page
 *
 * Tests the import functionality and product type configuration
 * Run: node test-phases-3-4.js
 */

const ImportService = require('./services/import-service');
const ProductTypeConfig = require('./services/product-type-config');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.log(`  ✗ ${message}`);
    failedTests++;
  }
}

function describe(title) {
  console.log(`\n${title}`);
}

// ============================================================================
// PHASE 3: IMPORT SERVICE TESTS
// ============================================================================

describe('Phase 3: Import Service - CSV Parsing');

const csvSample = `gtin,batch_id,style_id,item_number,ean,weight
5707141145391,1,1,112327-L30-W24,5707141145391,650
5707141145392,1,1,112327-L32-W24,5707141145392,660
5707141145407,1,2,131274-B01-003,5707141145407,200`;

const parsed = ImportService.parseCSV(csvSample);
assert(parsed.headers.length === 6, 'CSV headers parsed correctly (6 columns)');
assert(parsed.rows.length === 3, 'CSV rows parsed correctly (3 rows)');
assert(parsed.rows[0].gtin === '5707141145391', 'First GTIN extracted');
assert(parsed.rows[1].item_number === '112327-L32-W24', 'Item number extracted');

describe('Phase 3: Import Service - Row Validation');

const row1 = {
  gtin: '5707141145391',
  batch_id: '1',
  style_id: '1',
  item_number: '112327-L30-W24',
  ean: '5707141145391',
  weight: '650'
};

const validation1 = ImportService.validateGtinRow(row1, 0);
assert(validation1.valid, 'Valid GTIN row accepted');
assert(validation1.productType === 'jeans_adult', 'Jeans product type detected');
assert(validation1.parsed?.length === '30', 'Length component parsed');
assert(validation1.parsed?.waist === '24', 'Waist component parsed');

const row2 = {
  gtin: '5707141145407',
  batch_id: '1',
  style_id: '2',
  item_number: '131274-B01-003',
  ean: '5707141145407',
  weight: '200'
};

const validation2 = ImportService.validateGtinRow(row2, 2);
assert(validation2.valid, 'Valid T-shirt row accepted');
assert(validation2.productType === 'tshirt', 'T-shirt product type detected');
assert(validation2.parsed?.size === 'M', 'Size code mapped to M');
assert(validation2.parsed?.variant === 'B01', 'Variant extracted');

describe('Phase 3: Import Service - Product Type Detection');

const detection1 = ImportService.detectProductType({ item_number: '112327-L30-W24' });
assert(detection1.type === 'jeans_adult', 'Jeans pattern detected');
assert(detection1.detected === true, 'Detection flag set');
assert(detection1.confidence > 0.9, 'High confidence score');

const detection2 = ImportService.detectProductType({ item_number: '131274-B01-003' });
assert(detection2.type === 'tshirt', 'T-shirt pattern detected');

const detection3 = ImportService.detectProductType({ item_number: '910006-B26-K10' });
assert(detection3.type === 'kids', 'Kids product pattern detected');

const detection4 = ImportService.detectProductType({ item_number: '550001' });
assert(detection4.type === 'no_size', 'No-size product pattern detected');

describe('Phase 3: Import Service - Missing Fields Detection');

const badRow = { gtin: '', batch_id: '1' };
const badValidation = ImportService.validateGtinRow(badRow, 0);
assert(!badValidation.valid, 'Invalid row rejected');
assert(badValidation.errors.length > 0, 'Errors collected');

describe('Phase 3: Import Service - Summary Formatting');

const mockSummary = {
  totalRows: 100,
  created: [{ gtin: '5707141145391' }, { gtin: '5707141145392' }],
  skipped: [{ gtin: '5707141145407', reason: 'GTIN already exists in this batch' }],
  errors: [{ rowIndex: 10, errors: ['Invalid GTIN'] }],
  dryRun: true,
  timestamp: new Date().toISOString()
};

const stats = ImportService.getSummaryStats(mockSummary);
assert(stats.totalRows === 100, 'Total rows counted');
assert(stats.created === 2, 'Created count correct');
assert(stats.skipped === 1, 'Skipped count correct');
assert(stats.errors === 1, 'Errors count correct');
assert(stats.dryRun === true, 'Dry-run flag preserved');

const summary = ImportService.formatSummary(mockSummary);
assert(summary.includes('IMPORT SUMMARY'), 'Summary header included');
assert(summary.includes('[DRY RUN]'), 'Dry-run label included');
assert(summary.includes('Success Rate'), 'Success rate included');

// ============================================================================
// PHASE 4: ADMIN UI - GTIN DETAIL PAGE TESTS
// ============================================================================

describe('Phase 4: Admin UI - Product Type Configuration');

const allTypes = ProductTypeConfig.listProductTypes();
assert(allTypes.length === 4, 'All 4 product types available');
assert(allTypes.includes('jeans_adult'), 'Jeans adult type available');
assert(allTypes.includes('tshirt'), 'T-shirt type available');
assert(allTypes.includes('kids'), 'Kids type available');
assert(allTypes.includes('no_size'), 'No-size type available');

describe('Phase 4: Admin UI - Size Component Template Generation');

const jeansTemplate = ProductTypeConfig.getSizeComponentTemplate('jeans_adult');
assert(jeansTemplate.length === 2, 'Jeans has 2 size components');
assert(jeansTemplate[0].name === 'length', 'First component is length');
assert(jeansTemplate[1].name === 'waist', 'Second component is waist');

const tshirtTemplate = ProductTypeConfig.getSizeComponentTemplate('tshirt');
assert(tshirtTemplate.length === 2, 'T-shirt has 2 size components');
assert(tshirtTemplate[0].name === 'size', 'First component is size');
assert(tshirtTemplate[1].name === 'variant', 'Second component is variant');

const kidsTemplate = ProductTypeConfig.getSizeComponentTemplate('kids');
assert(kidsTemplate.length === 2, 'Kids has 2 size components');
assert(kidsTemplate[0].name === 'kid_size', 'First component is kid_size');
assert(kidsTemplate[1].name === 'variant', 'Second component is variant');

const noSizeTemplate = ProductTypeConfig.getSizeComponentTemplate('no_size');
assert(noSizeTemplate.length <= 1, 'No-size type has minimal components');

describe('Phase 4: Admin UI - Display Size Formatting');

const gtinJeans = {
  product_type: 'jeans_adult',
  size_value_1: '30',
  size_value_2: '24',
  size: 'legacy'
};
const displayJeans = ProductTypeConfig.getDisplaySize(gtinJeans);
assert(displayJeans === 'L30-W24', 'Jeans size formatted correctly');

const gtinTshirt = {
  product_type: 'tshirt',
  size_value_1: 'M',
  size_value_2: 'B01',
  size: 'legacy'
};
const displayTshirt = ProductTypeConfig.getDisplaySize(gtinTshirt);
assert(displayTshirt === 'M (B01)', 'T-shirt size formatted correctly');

const gtinKids = {
  product_type: 'kids',
  size_value_1: '10',
  size_value_2: 'B26',
  size: 'legacy'
};
const displayKids = ProductTypeConfig.getDisplaySize(gtinKids);
assert(displayKids === 'K10 (B26)', 'Kids size formatted correctly');

const gtinNoSize = {
  product_type: 'no_size',
  size_value_1: null,
  size_value_2: null,
  size: 'legacy'
};
const displayNoSize = ProductTypeConfig.getDisplaySize(gtinNoSize);
assert(displayNoSize === 'One Size', 'No-size formatted as "One Size"');

describe('Phase 4: Admin UI - Product Type Metadata');

const jeansConfig = ProductTypeConfig.getProductType('jeans_adult');
assert(jeansConfig.id === 'jeans_adult', 'Jeans config ID correct');
assert(jeansConfig.name === 'Adult Jeans', 'Jeans config name correct');
assert(jeansConfig.size_components?.length === 2, 'Jeans config has size_components');

const tshirtConfig = ProductTypeConfig.getProductType('tshirt');
assert(tshirtConfig.id === 'tshirt', 'T-shirt config ID correct');
assert(tshirtConfig.size_codes, 'T-shirt config has size_codes');

describe('Phase 4: Admin UI - Template Validation');

const validJeansSize = ProductTypeConfig.validateSize(
  { length: '30', waist: '24' },
  'jeans_adult'
);
assert(validJeansSize.valid, 'Valid jeans size accepted');
assert(validJeansSize.errors.length === 0, 'No errors for valid size');

const invalidJeansSize = ProductTypeConfig.validateSize(
  { length: 'XX', waist: '24' },
  'jeans_adult'
);
assert(!invalidJeansSize.valid, 'Invalid jeans size rejected');
assert(invalidJeansSize.errors.length > 0, 'Errors reported for invalid size');

const validTshirtSize = ProductTypeConfig.validateSize(
  { size: 'L', variant: 'B01' },
  'tshirt'
);
assert(validTshirtSize.valid, 'Valid t-shirt size accepted');

const invalidTshirtSize = ProductTypeConfig.validateSize(
  { size: 'XXL' },
  'tshirt'
);
assert(!invalidTshirtSize.valid, 'Invalid t-shirt size rejected');

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration Tests - Import Workflow');

const csvWorkflow = `gtin,batch_id,style_id,item_number,ean,weight
5707141145391,1,1,112327-L30-W24,5707141145391,650
131274-B01-003,1,2,131274-B01-003,131274-B01-003,200
910006-B26-K10,1,3,910006-B26-K10,910006-B26-K10,180`;

const parsed2 = ImportService.parseCSV(csvWorkflow);
assert(parsed2.rows.length === 3, 'Multi-type CSV parsed');

// Validate each row for product type
let validRows = 0;
parsed2.rows.forEach((row, idx) => {
  const val = ImportService.validateGtinRow(row, idx);
  if (val.valid && val.productType) {
    validRows++;
  }
});
assert(validRows === 3, 'All rows validated successfully');

describe('Integration Tests - Display Generation');

// Simulate GTIN records from import
const importedGtins = [
  {
    gtin: '5707141145391',
    product_type: 'jeans_adult',
    size_value_1: '30',
    size_value_2: '24',
    item_number: '112327-L30-W24'
  },
  {
    gtin: '131274-B01-003',
    product_type: 'tshirt',
    size_value_1: 'M',
    size_value_2: 'B01',
    item_number: '131274-B01-003'
  }
];

importedGtins.forEach(gtin => {
  const display = ProductTypeConfig.getDisplaySize(gtin);
  assert(display && display !== 'legacy', `Display generated for ${gtin.product_type}`);
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log(`PHASE 3 & 4 TEST RESULTS`);
console.log('='.repeat(80));
console.log(`✓ Passed: ${passedTests}`);
console.log(`✗ Failed: ${failedTests}`);
console.log(`Total:   ${passedTests + failedTests}`);
console.log('='.repeat(80));

if (failedTests === 0) {
  console.log('\n✅ ALL TESTS PASSED - Phases 3 & 4 ready for production\n');
  process.exit(0);
} else {
  console.log(`\n❌ ${failedTests} test(s) failed\n`);
  process.exit(1);
}
