# Product Model Design Document
## Flexible GTIN & Size System for Multi-Product-Type Support

**Status**: Draft Analysis  
**Date**: 2026-09-09  
**Version**: 1.0

---

## Executive Summary

The current DPP v2 model supports a **single size structure** (Size + Color + Variant columns) which doesn't work for Nudie Jeans' diverse product catalog:

- **Jeans (Adult)**: Length × Waist (e.g., "L30-W24")
- **T-shirts**: Size (XS-XL) + Color/Variant (B01, B02...)
- **Kids Jeans**: Kids Size (K07-K14) + Variant (B26)
- **No-Size Products**: No size attributes at all

**Solution**: Implement a **flexible, product-type-aware GTIN model** that:
- ✅ Supports unlimited size systems per product type
- ✅ Maintains data integrity and uniqueness
- ✅ Simplifies import from existing catalog
- ✅ Preserves existing DPP functionality
- ✅ Scales to future product types

---

## Part 1: Current State Analysis

### 1.1 Existing GTIN Model

```
Database Schema (gtins table):
├── id (PK)
├── batch_id (FK) 
├── style_id (FK)
├── gtin (TEXT, UNIQUE)
├── size (TEXT)
├── color (TEXT)
├── variant (TEXT, nullable)
├── weight (REAL)
```

**Current Assumption**: All products have Size, Color, and optional Variant.

### 1.2 Product Type Examples from Nudie Catalog

#### Example 1: Adult Jeans (Style 112327 - Loose Leif Crispy Faded)
```
Item Structure: 112327-L30-W24
├── 112327 = Style
├── L30 = Length
└── W24 = Waist

Combinations: 4 lengths (L30, L32, L34, L36) × 15 waists (W24-W38) = ~60 GTINs
Database mapping:
  gtin: "5711814012346" (one GTIN per L×W combination)
  size: "L30-W24" (composite)
  color: null
  variant: null
```

#### Example 2: T-Shirt (Style 131274 - Raw Hem T-shirt)
```
Item Structure: 131274-B01-003
├── 131274 = Style
├── B01 = Color/Variant (B01=Red, B02=Blue, etc.)
└── 003 = Size (001=XS, 002=S, 003=M, 004=L, 005=XL)

Combinations: 5+ variants × 5 sizes = 25+ GTINs
Database mapping:
  gtin: "5711814013100" (one GTIN per Variant×Size)
  size: "M" (only size)
  color: null
  variant: "B01" (color/variant code)
```

#### Example 3: Kids Jeans (Style 910006 - Tiny Turner Kid Rinsed Wash)
```
Item Structure: 910006-B26-K10
├── 910006 = Style
├── B26 = Variant/Batch
└── K10 = Kids Size (K07, K08, K10, K12, K14 = age/size)

Combinations: 1-5 variants × 5 kid sizes = 5-25 GTINs
Database mapping:
  gtin: "9100061000..." (one GTIN per Variant×KidSize)
  size: "10" (kids age/size)
  color: null
  variant: "B26"
```

#### Example 4: No-Size Products (Belts, Scarves, etc.)
```
Item Structure: XXXXX-YYY (or just XXXXX)
├── XXXXX = Style
└── YYY = Variant/Batch (optional)

Combinations: Only variants, no size dimension
Database mapping:
  gtin: "XXXXXXXXXXXXX" (one per variant)
  size: null (no size)
  color: null
  variant: "YYY" (if applicable)
```

---

## Part 2: Problem Analysis

### 2.1 Current Model Limitations

| Issue | Impact | Severity |
|-------|--------|----------|
| **Fixed 3-column size system** | Can't represent L×W or K-sizes natively | 🔴 Critical |
| **Size always required** | No-size products must have null/dummy value | 🟡 High |
| **Color/Variant ambiguous** | Unclear if B01 is color, variant, or batch | 🟡 High |
| **No product type config** | Admin can't show right fields per product | 🟡 High |
| **Item number not stored** | Can't trace back to original catalog | 🟡 Medium |
| **Single size format** | Can't distinguish "M" from "L30" in queries | 🟠 Medium |

### 2.2 Affected System Components

```
┌─────────────────────────────────────────────────────┐
│ Import System                                       │
│ ├─ Parse item numbers (different per type)         │
│ ├─ Extract size components correctly                │
│ └─ Validate uniqueness constraints                  │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ Database Schema (GTIN)                              │
│ ├─ Must handle multiple size formats                │
│ ├─ Needs product type awareness                     │
│ └─ Maintain backward compatibility                  │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ Admin UI                                            │
│ ├─ Show correct fields per product type             │
│ ├─ Parse/display size correctly                     │
│ └─ Support bulk operations                          │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ Consumer Passport                                   │
│ ├─ Display size in native format                    │
│ └─ Generate correct QR codes                        │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│ API & Search                                        │
│ ├─ Filter by size (different formats)               │
│ └─ Search across multiple product types             │
└─────────────────────────────────────────────────────┘
```

---

## Part 3: Impact Assessment

### 3.1 Database Schema Changes

**Current:**
```sql
CREATE TABLE gtins (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL,
  style_id INTEGER NOT NULL,
  gtin TEXT NOT NULL UNIQUE,
  size TEXT,
  color TEXT,
  variant TEXT,
  weight REAL
);
```

**Proposed - Option A (Flexible Attributes):**
```sql
CREATE TABLE gtins (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL,
  style_id INTEGER NOT NULL,
  gtin TEXT NOT NULL UNIQUE,
  product_type TEXT NOT NULL,  -- NEW: "jeans", "tshirt", "kids", "no-size"
  item_number TEXT,             -- NEW: original catalog item (112327-L30-W24)
  
  -- Size System (flexible interpretation per product_type)
  size_value_1 TEXT,            -- L30, M, K10, etc.
  size_value_2 TEXT,            -- W24, B01, etc. (optional)
  size_value_3 TEXT,            -- Future flexibility
  
  weight REAL,
  UNIQUE(batch_id, gtin),
  INDEX(product_type, style_id)
};
```

**Alternative - Option B (JSON for Size):**
```sql
CREATE TABLE gtins (
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL,
  style_id INTEGER NOT NULL,
  gtin TEXT NOT NULL UNIQUE,
  product_type TEXT NOT NULL,
  item_number TEXT,
  size_data JSON,               -- {"length": "30", "waist": "24"} or {"size": "M", "color": "B01"}
  weight REAL
);
```

**Recommendation**: **Option A** (easier to query and migrate)

### 3.2 Admin UI Changes

**Impact**: Medium-High

Currently shows:
```
GTIN: 5711814012346
Size: "L30-W24"
Color: null
Variant: null
```

Needs to show (per product type):
- **Jeans**: Length dropdown + Waist dropdown
- **T-shirt**: Size dropdown + Variant/Color dropdown  
- **Kids**: Kids Size dropdown + Variant dropdown
- **No-Size**: Hide size fields

### 3.3 Import Process Changes

**Impact**: High

Currently assumes:
```
parse_gtin(item_number) → {gtin, size, color, variant}
```

Needs to support:
```
parse_gtin(item_number, product_type) → {gtin, size_value_1, size_value_2, variant, color}
```

**Different parsers per type:**
- **Jeans**: `112327-L30-W24` → extract L/W
- **T-shirt**: `131274-B01-003` → extract variant/size code
- **Kids**: `910006-B26-K10` → extract variant/kid-size
- **No-Size**: `XXXXX-YYY` → just variant

### 3.4 Consumer Passport Changes

**Impact**: Low-Medium

Currently displays:
```
Size: L30-W24
Color: null
Variant: null
```

Needs to display correctly per type:
- **Jeans**: "Length 30 × Waist 24" (formatted)
- **T-shirt**: "Size M, Color: B01-Red"
- **Kids**: "Kids Size 10"
- **No-Size**: Hide size section

### 3.5 Backward Compatibility

**Risk**: Low with migration

Migration path:
1. Add new columns (size_value_1, size_value_2, product_type)
2. Set `product_type = 'legacy'` for existing GTINs
3. Move existing (size, color, variant) → (size_value_1, size_value_2, null)
4. Old queries continue to work
5. New code uses new columns

---

## Part 4: Proposed Flexible Model

### 4.1 Product Type Configuration

```javascript
// services/product-type-config.js

const PRODUCT_TYPES = {
  jeans_adult: {
    id: 'jeans_adult',
    name: 'Adult Jeans',
    size_format: 'length_x_waist',
    size_components: ['length', 'waist'],
    item_pattern: /^(\d+)-L(\d+)-W(\d+)$/,  // 112327-L30-W24
    parse: (itemNumber) => ({
      style_id: itemNumber.match(/^(\d+)/)[1],
      length: itemNumber.match(/-L(\d+)/)[1],
      waist: itemNumber.match(/-W(\d+)/)[1]
    })
  },
  
  tshirt: {
    id: 'tshirt',
    name: 'T-Shirt',
    size_format: 'size_and_color',
    size_components: ['size', 'variant'],
    item_pattern: /^(\d+)-([A-Z]\d+)-(\d+)$/,  // 131274-B01-003
    parse: (itemNumber) => ({
      style_id: itemNumber.match(/^(\d+)/)[1],
      variant: itemNumber.match(/-([A-Z]\d+)-/)[1],
      size_code: itemNumber.match(/-(\d+)$/)[1],
      size_label: {001: 'XS', 002: 'S', 003: 'M', 004: 'L', 005: 'XL'}[itemNumber.match(/-(\d+)$/)[1]]
    })
  },
  
  kids: {
    id: 'kids',
    name: 'Kids Jeans',
    size_format: 'kid_size_and_variant',
    size_components: ['variant', 'kid_size'],
    item_pattern: /^(\d+)-([A-Z]\d+)-K(\d+)$/,  // 910006-B26-K10
    parse: (itemNumber) => ({
      style_id: itemNumber.match(/^(\d+)/)[1],
      variant: itemNumber.match(/-([A-Z]\d+)-/)[1],
      kid_size: itemNumber.match(/-K(\d+)$/)[1]
    })
  },
  
  no_size: {
    id: 'no_size',
    name: 'No-Size Product',
    size_format: null,
    size_components: [],
    item_pattern: /^(\d+)(?:-([A-Z0-9]+))?$/,
    parse: (itemNumber) => ({
      style_id: itemNumber.match(/^(\d+)/)[1],
      variant: itemNumber.match(/-([A-Z0-9]+)$/)?.[1] || null
    })
  }
};
```

### 4.2 GTIN Record Representation

```javascript
// New flexible GTIN record structure

const gtinJeansExample = {
  id: 1,
  batch_id: 1,
  style_id: 1,
  gtin: '5711814012346',
  product_type: 'jeans_adult',
  item_number: '112327-L30-W24',
  size_value_1: '30',          // Length
  size_value_2: '24',          // Waist
  size_value_3: null,
  weight: 0.5,
  // Computed properties:
  size_display: 'L30-W24',
  size_components: { length: '30', waist: '24' }
};

const gtinTshirtExample = {
  id: 2,
  batch_id: 2,
  style_id: 2,
  gtin: '5711814013100',
  product_type: 'tshirt',
  item_number: '131274-B01-003',
  size_value_1: 'M',           // Size
  size_value_2: 'B01',         // Variant/Color
  size_value_3: null,
  weight: 0.3,
  size_display: 'M (B01)',
  size_components: { size: 'M', variant: 'B01' }
};

const gtinNoSizeExample = {
  id: 3,
  batch_id: 3,
  style_id: 3,
  gtin: '5711814050000',
  product_type: 'no_size',
  item_number: 'XXXXX-YYY',
  size_value_1: null,
  size_value_2: null,
  size_value_3: null,
  weight: 0.2,
  size_display: 'One Size',
  size_components: {}
};
```

### 4.3 Query Patterns

```javascript
// Find all jeans in a batch
db.all(`
  SELECT * FROM gtins 
  WHERE batch_id = ? AND product_type = 'jeans_adult'
  ORDER BY size_value_1, size_value_2
`, [batchId]);

// Find specific T-shirt variant
db.get(`
  SELECT * FROM gtins
  WHERE batch_id = ? AND product_type = 'tshirt'
  AND size_value_1 = ? AND size_value_2 = ?
`, [batchId, 'M', 'B01']);

// Universal GTIN lookup
db.get(`
  SELECT * FROM gtins WHERE gtin = ?
`, [gtin]);
```

---

## Part 5: Implementation Plan

### Phase 1: Database Schema (Week 1)
- [ ] Add new columns to gtins table
- [ ] Create migration script
- [ ] Backfill existing data
- [ ] Update indexes

### Phase 2: Product Type Config (Week 1)
- [ ] Create `product-type-config.js`
- [ ] Define all 4 product types
- [ ] Implement item number parsers
- [ ] Unit test parsers

### Phase 3: Import System (Week 2)
- [ ] Create import service
- [ ] Support CSV input
- [ ] Validate against configs
- [ ] Handle duplicates & conflicts

### Phase 4: Admin UI (Week 2-3)
- [ ] Add product type selector
- [ ] Dynamic form fields per type
- [ ] Display size correctly
- [ ] Bulk import UI

### Phase 5: Consumer & API (Week 3)
- [ ] Update passport display
- [ ] Fix QR codes
- [ ] Test all flows
- [ ] Documentation

### Phase 6: Migration & Testing (Week 4)
- [ ] Migrate production data
- [ ] Regression testing
- [ ] Performance validation
- [ ] Deployment

---

## Part 6: Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Migration data loss | 🔴 Critical | 🟢 Low | Dry run + backup + rollback plan |
| Size parsing errors | 🔴 Critical | 🟡 Medium | Unit tests + manual validation |
| Admin UI bugs | 🟡 High | 🟡 Medium | QA in staging, phased rollout |
| Performance regression | 🟡 High | 🟢 Low | Index strategy, load testing |
| Backward compat breaks | 🟠 Medium | 🟡 Medium | Keep legacy code paths |

---

## Part 7: Recommendations

✅ **Approve**: Option A (size_value_1/2/3 columns)
- Simpler to query
- Easier to migrate
- Better indexing
- Less dependency on JSON parsing

✅ **Start with**: Jeans + T-shirts
- 80% of catalog
- Similar complexity to kids later

✅ **Build import first**
- Unlocks rapid data validation
- Identifies parsing issues early

✅ **Keep existing code working**
- Use compatibility layer
- Gradual adoption of new model

---

## Appendix: SQL Migration Examples

```sql
-- Add new columns
ALTER TABLE gtins ADD COLUMN product_type TEXT DEFAULT 'legacy';
ALTER TABLE gtins ADD COLUMN item_number TEXT;
ALTER TABLE gtins ADD COLUMN size_value_1 TEXT;
ALTER TABLE gtins ADD COLUMN size_value_2 TEXT;
ALTER TABLE gtins ADD COLUMN size_value_3 TEXT;

-- Create new indexes
CREATE INDEX idx_gtins_product_type ON gtins(product_type, batch_id);
CREATE INDEX idx_gtins_item_number ON gtins(item_number);

-- Backfill legacy data
UPDATE gtins SET size_value_1 = size WHERE product_type = 'legacy';
UPDATE gtins SET size_value_2 = color WHERE product_type = 'legacy' AND color IS NOT NULL;
UPDATE gtins SET size_value_3 = variant WHERE product_type = 'legacy' AND variant IS NOT NULL;
```

---

**Document Version History**:
- v1.0 - Initial analysis and recommendations
