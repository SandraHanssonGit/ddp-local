# DPP Database Schema

Digital Product Passport (ESPR 2024/1781 compliant) database architecture.

## Core Tables

### `users`
Authentication and access control
- `id` (PK): Auto-incrementing ID
- `username`: Unique username
- `password`: Bcrypt hashed password
- `role`: user role (super_admin, admin, editor, api_client, viewer)
- `created_at`: Timestamp

**Roles:**
- `super_admin`: Full system access
- `admin`: Can edit products and serials
- `editor`: Can edit product info
- `api_client`: API-only access
- `viewer`: Read-only access

---

## Product & Batch Data

### `styles`
Product level metadata (jeans or tops with variants)
- `id` (PK): Auto-incrementing ID
- `style_number`: Product identifier (e.g., "114519")
- `variant`: Optional variant code (e.g., "B20" for tops, NULL for jeans)
- `product_type`: "jeans" or "tops"
- `product_name`: Human-readable product name
- `description`: Product description
- `care_instructions`: Washing/care info
- `delivery_returns`: Return policy
- `size_material_composition`: Material content info
- `images`: JSON array of image URLs
- `gtin_14`: GS1 Global Trade Item Number (14 digits, product-level)
- `created_at`, `updated_at`, `deleted_at`: Timestamps

**Key:** `UNIQUE(style_number, variant)` - ensures unique style+variant combinations

---

### `batches`
Production batch information (can contain multiple styles)
- `id` (PK): Auto-incrementing ID
- `batch_id` (UNIQUE): Batch identifier (e.g., "BATCH001")
- `po`: Purchase order number
- `total_units`: Number of units in batch
- `partner_name`: Manufacturing partner name
- `production_date`: Manufacturing date
- `manufacturing_details`: Additional info about production
- `created_at`, `deleted_at`: Timestamps

---

### `serials`
Individual serial numbers (unique product instance)
- `id` (PK): Auto-incrementing ID
- `batch_id` (FK → batches): Which batch contains this serial
- `style_number` (FK → styles): Which style this serial belongs to
- `variant`: Same variant as style (for jeans: NULL, for tops: variant code)
- `serial_number` (UNIQUE): Unique serial identifier (e.g., "001AA")
- `sgtin_numeric`: Serialized GTIN numeric format (auto-generated: `GTIN-14 + serial`)
- `sgtin_uri`: Serialized GTIN URI format (auto-generated: `/01/GTIN-14/21/serial`)
- `rfid`: RFID tag identifier
- `created_at`, `deleted_at`: Timestamps
- `view_count`: Public passport views

**Foreign Keys:**
- `batch_id` → `batches.batch_id` (ON DELETE CASCADE)
- `style_number` → `styles.style_number`

**Auto-generated on first scan:**
- `sgtin_numeric` = `{style.gtin_14}{serial_number}`
- `sgtin_uri` = `/01/{style.gtin_14}/21/{serial_number}`

---

## Data Hierarchy

```
Product (style_number + variant)
  ├── GTIN-14 (stored here, product-level)
  ├── Product Info (name, description, care, etc.)
  └── Variants (tops only; jeans have variant = NULL)

Batch
  └── Multiple Products (batch can contain jeans + tops mixed)
      └── Serial Numbers
          ├── SGTIN (auto-generated from product.gtin_14 + serial)
          └── Serial-specific Data (size, condition, location)
```

---

## Pass Versioning (ESPR Compliance)

### `batch_style_data`
Current material composition for style within batch (with versioning)
- `id` (PK): Auto-incrementing ID
- `batch_id` (FK): Which batch
- `style_number` (FK): Which style
- `variant`: Variant code or NULL
- `composition`: Material composition JSON
- `version`: Data version number
- `updated_by`: User who made the update
- **`pass_version`**: Current pass version (ESPR)
- **`pass_issued_at`**: When this version was issued
- **`pass_change_type`**: "initial", "correction", "update", "clarification"
- **`pass_change_note`**: Human-readable reason for change
- **`pass_supersedes`**: Which previous version this replaces
- `created_at`, `updated_at`: Timestamps

**Key:** `UNIQUE(batch_id, style_number, variant)` - one record per batch-style combo

---

### `batch_style_data_archive`
Historical versions of material composition (immutable audit trail)
- `id` (PK): Auto-incrementing ID
- `pass_version`: Version number (historical)
- `batch_id`: Which batch
- `style_number`: Which style
- `variant`: Variant or NULL
- `composition`: Composition at this version
- `pass_issued_at`: When issued
- `pass_change_type`: Type of change
- `pass_change_note`: Reason for change
- `pass_supersedes`: Previous version
- `archived_at`: When archived

**Key:** `UNIQUE(batch_id, style_number, variant, pass_version)` - immutable history

---

## Content Tables (Product-level)

### `style_images`
Product images (one per style+variant)
- `id` (PK): Auto-incrementing ID
- `style_number`: Which style
- `variant`: Variant or NULL
- `image_data`: Base64-encoded image data
- `image_name`: Original filename
- `created_at`: Timestamp

**Key:** `UNIQUE(style_number, variant)`

---

### `batch_images`
Batch/production images
- `id` (PK): Auto-incrementing ID
- `batch_id` (FK): Which batch
- `image_data`: Base64-encoded image
- `image_name`: Filename
- `created_at`: Timestamp

---

### `transparency_data`
Supply chain transparency (per style+variant)
- `id` (PK): Auto-incrementing ID
- `style_number`: Which style
- `variant`: Variant or NULL
- `suppliers_chain`: JSON with supplier locations
- `certifications`: JSON with certification data
- `environmental_data`: JSON with environmental metrics
- `social_data`: JSON with social/labor metrics
- `created_at`, `updated_at`: Timestamps

**Key:** `UNIQUE(style_number, variant)`

---

### `nudie_values`
Repair, trade-in, and partner information (per style+variant)
- `id` (PK): Auto-incrementing ID
- `style_number`: Which style
- `variant`: Variant or NULL
- `repair_info`: Repair policy
- `trade_in_info`: Trade-in offer info
- `partner_links`: JSON array of partner links
- `created_at`, `updated_at`: Timestamps

**Key:** `UNIQUE(style_number, variant)`

---

### `storytelling`
Brand story and editorial content (per style+variant)
- `id` (PK): Auto-incrementing ID
- `style_number`: Which style
- `variant`: Variant or NULL
- `summary`: Short summary
- `content`: Long-form story content
- `links`: JSON array of related links
- `created_at`, `updated_at`: Timestamps

**Key:** `UNIQUE(style_number, variant)`

---

## Flexible Data Tables

### `serial_data`
Key-value pairs for serial-specific metadata
- `id` (PK): Auto-incrementing ID
- `serial_id` (FK → serials): Which serial
- `key`: Data key (e.g., "size", "condition", "location")
- `value`: Data value
- `added_by`: User who added this data
- `added_at`: Timestamp

**Common keys:**
- `size`: Garment size (e.g., "M", "L")
- `condition`: Item condition (e.g., "new", "repaired", "reused")
- `location`: Warehouse/store location

---

### `batch_data`
Key-value pairs for batch-level metadata
- `id` (PK): Auto-incrementing ID
- `batch_id` (FK → batches): Which batch
- `key`: Data key
- `value`: Data value
- `added_at`: Timestamp

---

## Event & Audit

### `events`
Product lifecycle events (repair, recycling, trade-in, etc.)
- `id` (PK): Auto-incrementing ID
- `serial_id` (FK → serials): Which serial
- `event_type`: "scanned", "repaired", "recycled", "traded_in", etc.
- `event_data`: JSON object with event details
- `created_at`: Timestamp

**Event types:**
- `scanned`: First scan/creation
- `repaired`: Sent for repair
- `recycled`: Recycled/returned
- `traded_in`: Traded in for credit
- Custom events from partners

---

### `audit_log`
Immutable audit trail of all data changes (for ESPR compliance)
- `id` (PK): Auto-incrementing ID
- `table_name`: Which table was modified
- `record_id`: Which record
- `pass_version`: Associated pass version
- `action`: "INSERT", "UPDATE", "DELETE"
- `change_type`: Reason for change (correction, update, clarification)
- `change_note`: Human-readable explanation
- `old_value`: Previous value (if UPDATE)
- `new_value`: New value (if UPDATE)
- `changed_by`: User who made the change
- `created_at`: Timestamp

---

## Statistics & Analytics

### `page_views`
Public passport view tracking
- `id` (PK): Auto-incrementing ID
- `page_type`: "public_passport", etc.
- `page_id`: Serial number viewed
- `pass_version_viewed`: Which pass version was shown
- `username`: User viewing (if logged in)
- `created_at`: Timestamp

---

### `settings`
System configuration
- `id` (PK): Auto-incrementing ID
- `key` (UNIQUE): Setting key (e.g., "logo", "company_name")
- `value`: Setting value (JSON if needed)
- `created_at`, `updated_at`: Timestamps

---

## URL Formats

### Public Passport Access

**GS1 Digital Link (preferred, immutable):**
```
/01/{GTIN-14}/21/{serial_number}
```
Example: `/01/12345678912345/21/001AA`

**Legacy format (backwards compatible):**
```
/p/{style_number}/{batch_id}/{serial_number}
```
Example: `/p/112090/BATCH001/001AA`

**Auto-redirect:** When style has GTIN-14, legacy URLs redirect to GS1 format.

---

## Data Precedence (Multi-level Data)

For material composition:
1. **Serial-level:** Specific to one item (if exists)
2. **Batch-Style level:** Common for all serials of this style in this batch
3. **Style-level:** Default for all batches

Used for content display on public passport.

---

## Indexes

**Primary lookup:**
- `idx_styles_style_number`: Fast style lookup
- `idx_batches_batch_id`: Fast batch lookup
- `idx_serials_serial_number`: Fast serial lookup
- `idx_serials_batch_id`, `idx_serials_style_number`: Navigate from batch/style to serials

**Data lookups:**
- `idx_serial_data_serial_id`: Serial attributes
- `idx_events_serial_id`: Serial events

**SGTIN/RFID lookups:**
- `idx_serials_sgtin_numeric`: Find by SGTIN numeric
- `idx_serials_sgtin_uri`: Find by SGTIN URI
- `idx_serials_rfid`: Find by RFID tag

**Analytics:**
- `idx_page_views_page_type`, `page_id`, `created_at`: View statistics

**Pass versioning:**
- `idx_batch_style_data_pass_version`: Historical versions
- `idx_batch_style_data_archive_version`: Archive access

---

## Data Integrity

**Soft Deletes:** Records have `deleted_at` column
- Styles, batches, and serials can be soft-deleted
- Queries should check `WHERE deleted_at IS NULL`

**Cascade Deletes:**
- `serials` → `batch_style_data_archive` (ON DELETE CASCADE)
- Orphaned records auto-cleaned on startup

**Foreign Key Constraints:**
- Serials require valid batch_id and style_number
- Serial data/events require valid serial_id
- Batch data requires valid batch_id

---

## ESPR Compliance Features

✅ **Pass Versioning:** Every change tracked with version numbers  
✅ **Immutable URLs:** GS1 Digital Link format with serial/GTIN  
✅ **Change History:** `batch_style_data_archive` preserves all versions  
✅ **Audit Trail:** `audit_log` tracks who changed what and why  
✅ **Change Classification:** Corrections, updates, clarifications tracked  
✅ **Supersession:** Pass versions can reference what they replace  

---

## Test Data

On first run, the database seeds with:
- 1 Product style: "114519" (Lofty Lo jeans)
- 1 Batch: "BATCH001" with 100 units
- 3 Test serials: "001AA", "001AB", "001AC"
- Test users: sandra (super_admin), viewer, editor, admin
- Test supply chain, certifications, and sustainability data
