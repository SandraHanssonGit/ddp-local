# Dynamic DPP Fields Architecture - Förslag

## Översikt

Istället för statiska detail-sidor, ska varje entity-typ (Style, Variant, Batch, GTIN) visa **dynamiska DPP-värde-formulär** baserat på vilka fält som är definierade i `field_definitions` tabellen.

## 1. Database-modellen

### Befintliga tabeller
```sql
field_definitions (redan befintlig)
  - id
  - field_key (ex: "material_composition")
  - label (ex: "Material Composition")
  - category (eu_required, nudie)
  - data_type (text, textarea, json, number, date)
  - entity_types (JSON array: ["style", "variant", "batch", "gtin"])
  - required
  - consumer_visible
  - sort_order

dpp_values (redan befintlig)
  - id
  - field_definition_id
  - entity_type (style, variant, batch, gtin)
  - entity_id
  - value (JSON string)
  - source_system
  - created_by
  - created_at
  - updated_at
```

### Ny metadata-tabell (optional)
```sql
CREATE TABLE field_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_definition_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  placeholder TEXT,
  help_text TEXT,
  validation_rules JSON,
  default_value TEXT,
  FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id),
  UNIQUE(field_definition_id, entity_type)
);
```

## 2. API-struktur

### Hämta fields för en entity-typ
```javascript
GET /api/admin/fields?entity_types=style,variant

Response:
{
  "fields": [
    {
      "id": 1,
      "field_key": "material_composition",
      "label": "Material Composition",
      "data_type": "textarea",
      "category": "eu_required",
      "entity_types": ["style", "variant"],
      "required": true,
      "sort_order": 1
    },
    {
      "id": 2,
      "field_key": "care_instructions",
      "label": "Care Instructions",
      "data_type": "json",
      "category": "eu_required",
      "entity_types": ["style", "variant"],
      "required": false,
      "sort_order": 2
    },
    ...
  ]
}
```

### Hämta DPP-värden för en entity
```javascript
GET /api/admin/dpp-values/style/112327

Response:
{
  "entity_type": "style",
  "entity_id": 112327,
  "values": {
    "material_composition": "100% Cotton",
    "care_instructions": { "wash": "40°", "dry": "no" },
    "carbon_footprint_kg_co2e": 14.32,
    "supply_chain_journey": [
      { "step": "rawMaterial", "parties": [...] },
      ...
    ]
  }
}
```

### Spara DPP-värden för en entity
```javascript
POST /api/admin/dpp-values/style/112327

Request:
{
  "values": {
    "material_composition": "100% Cotton",
    "care_instructions": { "wash": "40°", "dry": "no" },
    "carbon_footprint_kg_co2e": 14.32
  }
}

Response:
{
  "success": true,
  "updated": 3
}
```

### Hämta values med inheritance (för Variant)
```javascript
GET /api/admin/dpp-values/variant/2/with-inheritance

Response:
{
  "entity_type": "variant",
  "entity_id": 2,
  "parent_type": "style",
  "parent_id": 112327,
  "values": {
    "material_composition": {
      "value": null,
      "inherited_from": "style",
      "inherited_value": "100% Cotton"
    },
    "care_instructions": {
      "value": { "wash": "30°", "dry": "no" },
      "inherited_from": "variant",
      "is_override": true
    }
  }
}
```

## 3. Admin UI - Style Detail (anpassad till befintlig design)

```html
<!-- Befintlig Style Information Card -->
<div class="bg-white rounded-lg shadow-md p-8">
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-2xl font-bold text-gray-900">Style Information</h2>
    <button onclick="toggleEdit('style-info')" class="bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-800 font-semibold">
      Edit
    </button>
  </div>
  <!-- ... existing style info ... -->
</div>

<!-- NEW: DPP Values Card -->
<div class="bg-white rounded-lg shadow-md p-8">
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-2xl font-bold text-gray-900">Digital Product Passport (DPP)</h2>
    <button onclick="toggleEdit('dpp-values')" class="bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-800 font-semibold">
      Edit
    </button>
  </div>

  <!-- VIEW MODE -->
  <div id="dpp-values-view" class="space-y-6">
    <!-- Dynamically rendered from API: /api/admin/fields?entity_types=style -->
    
    <!-- FIELD: Material Composition -->
    <div>
      <div class="flex justify-between items-start mb-2">
        <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Material Composition
        </label>
        <span class="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
          EU Required
        </span>
      </div>
      <p class="text-gray-900">100% Cotton</p>
    </div>

    <!-- FIELD: Care Instructions -->
    <div>
      <div class="flex justify-between items-start mb-2">
        <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Care Instructions
        </label>
        <span class="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
          EU Required
        </span>
      </div>
      <pre class="bg-gray-50 p-4 rounded text-xs overflow-auto">
{
  "washing": "Machine wash 40°",
  "ironing": "Iron at low temperature",
  "bleaching": "Do not bleach"
}
      </pre>
    </div>

    <!-- FIELD: Carbon Footprint -->
    <div>
      <div class="flex justify-between items-start mb-2">
        <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Carbon Footprint (kg CO₂e)
        </label>
        <span class="bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-1 rounded">
          Nudie Specific
        </span>
      </div>
      <p class="text-gray-900">14.32</p>
    </div>

    <!-- FIELD: Supply Chain Journey -->
    <div>
      <div class="flex justify-between items-start mb-2">
        <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Supply Chain Journey
        </label>
        <span class="bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-1 rounded">
          Nudie Specific
        </span>
      </div>
      <div class="space-y-3">
        <div class="border-l-4 border-gray-300 pl-4 py-2">
          <p class="font-semibold text-sm text-gray-900">Raw Material</p>
          <p class="text-sm text-gray-600">Akasya ltd, Egecurt Tarim San.</p>
        </div>
        <div class="border-l-4 border-gray-300 pl-4 py-2">
          <p class="font-semibold text-sm text-gray-900">Spinning</p>
          <p class="text-sm text-gray-600">Orta Anadolu</p>
        </div>
      </div>
    </div>
  </div>

  <!-- EDIT MODE -->
  <form id="dpp-values-edit" class="hidden space-y-6" onsubmit="saveDppValues(event)">
    <!-- Dynamically rendered form inputs based on fields from API -->
    
    <!-- FIELD: Material Composition (textarea) -->
    <div>
      <label class="block text-sm font-bold text-gray-700 mb-2">
        Material Composition
        <span class="text-blue-600">(EU Required)</span>
      </label>
      <textarea 
        id="edit-material_composition" 
        class="w-full border border-gray-300 rounded px-4 py-3 focus:outline-none focus:border-gray-900"
        rows="3"
        placeholder="Enter material composition"
      >100% Cotton</textarea>
      <p class="text-xs text-gray-500 mt-1">Material composition of the garment</p>
    </div>

    <!-- FIELD: Care Instructions (json textarea) -->
    <div>
      <label class="block text-sm font-bold text-gray-700 mb-2">
        Care Instructions
        <span class="text-blue-600">(EU Required)</span>
      </label>
      <textarea 
        id="edit-care_instructions" 
        class="w-full border border-gray-300 rounded px-4 py-3 focus:outline-none focus:border-gray-900 font-mono text-xs"
        rows="6"
        placeholder='{"washing": "...", "ironing": "..."}'
      >{
  "washing": "Machine wash 40°",
  "ironing": "Iron at low temperature",
  "bleaching": "Do not bleach"
}</textarea>
      <p class="text-xs text-gray-500 mt-1">Enter as JSON object</p>
    </div>

    <!-- FIELD: Carbon Footprint (number) -->
    <div>
      <label class="block text-sm font-bold text-gray-700 mb-2">
        Carbon Footprint (kg CO₂e)
        <span class="text-purple-600">(Nudie Specific)</span>
      </label>
      <input 
        type="number" 
        id="edit-carbon_footprint_kg_co2e" 
        class="w-full border border-gray-300 rounded px-4 py-3 focus:outline-none focus:border-gray-900"
        step="0.01"
        value="14.32"
        placeholder="Enter carbon footprint"
      />
    </div>

    <div class="flex gap-3">
      <button type="submit" class="bg-gray-900 text-white px-6 py-3 rounded hover:bg-gray-800 font-semibold">
        Save Changes
      </button>
      <button type="button" onclick="toggleEdit('dpp-values')" class="bg-gray-300 text-gray-900 px-6 py-3 rounded hover:bg-gray-400 font-semibold">
        Cancel
      </button>
    </div>
  </form>
</div>
```

**Design notes:**
- ✅ Använder samma Tailwind-klasser som befintliga sidor
- ✅ Toggle Edit pattern med View/Edit modes
- ✅ Samma färgade category-badges (blue för EU, purple för Nudie)
- ✅ Samma input-styling (border border-gray-300, px-4 py-3)
- ✅ Samma button-styling (bg-gray-900 hover:bg-gray-800)
- ✅ Samma label-styling (text-xs text-gray-500 uppercase)
- ✅ Responsiv grid layout

## 4. Admin UI - Variant Detail (anpassad + inheritance)

```html
<!-- NEW: DPP Values Card with Inheritance -->
<div class="bg-white rounded-lg shadow-md p-8">
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-2xl font-bold text-gray-900">Digital Product Passport (DPP)</h2>
    <button onclick="toggleEdit('dpp-values')" class="bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-800 font-semibold">
      Edit
    </button>
  </div>

  <div class="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
    <p class="text-sm text-blue-900">
      <strong>ℹ️ Inheritance:</strong> Values inherit from Style unless overridden below
    </p>
  </div>

  <!-- VIEW MODE -->
  <div id="dpp-values-view" class="space-y-6">
    
    <!-- FIELD: Material Composition (inherited, not overridden) -->
    <div class="border-l-4 border-gray-300 pl-4">
      <div class="flex justify-between items-start mb-2">
        <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Material Composition
        </label>
        <span class="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
          EU Required
        </span>
      </div>
      <p class="text-sm text-gray-600 mb-2">Inherited from Style</p>
      <p class="text-gray-900 font-semibold">100% Cotton</p>
    </div>

    <!-- FIELD: Care Instructions (overridden) -->
    <div class="border-l-4 border-green-400 pl-4 bg-green-50">
      <div class="flex justify-between items-start mb-2">
        <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Care Instructions
        </label>
        <span class="bg-green-100 text-green-800 text-xs font-semibold px-2 py-1 rounded">
          Overridden
        </span>
      </div>
      <p class="text-sm text-gray-600 mb-3">
        <strong>Style default:</strong>
      </p>
      <pre class="bg-white p-2 rounded text-xs overflow-auto mb-3 border border-gray-200">
{
  "washing": "Machine wash 40°",
  "ironing": "Iron at low temperature"
}
      </pre>
      <p class="text-sm text-gray-600 mb-2">
        <strong>Variant override:</strong>
      </p>
      <pre class="bg-white p-2 rounded text-xs overflow-auto border border-gray-200">
{
  "washing": "Machine wash 30°",
  "ironing": "No ironing",
  "bleaching": "Do not bleach"
}
      </pre>
    </div>

  </div>

  <!-- EDIT MODE -->
  <form id="dpp-values-edit" class="hidden space-y-6" onsubmit="saveDppValues(event)">
    
    <!-- FIELD: Material Composition (inherited, toggle to override) -->
    <div class="border-l-4 border-gray-300 pl-4 py-4">
      <div class="flex justify-between items-start mb-4">
        <div>
          <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
            Material Composition
          </label>
          <p class="text-sm text-gray-600 mt-1">Currently: <strong>Inherited from Style</strong></p>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input 
            type="checkbox" 
            id="override-material_composition"
            onchange="toggleFieldOverride('material_composition')"
          />
          <span class="text-sm text-gray-700">Override</span>
        </label>
      </div>

      <textarea 
        id="edit-material_composition" 
        class="w-full border border-gray-300 rounded px-4 py-3 focus:outline-none focus:border-gray-900 hidden"
        rows="3"
        placeholder="Leave empty to use Style default"
      ></textarea>
    </div>

    <!-- FIELD: Care Instructions (currently overridden) -->
    <div class="border-l-4 border-green-400 pl-4 py-4 bg-green-50">
      <div class="flex justify-between items-start mb-4">
        <div>
          <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
            Care Instructions
          </label>
          <p class="text-sm text-gray-600 mt-1">Currently: <strong>Overridden at Variant level</strong></p>
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input 
            type="checkbox" 
            id="override-care_instructions"
            checked
            onchange="toggleFieldOverride('care_instructions')"
          />
          <span class="text-sm text-gray-700">Override</span>
        </label>
      </div>

      <textarea 
        id="edit-care_instructions" 
        class="w-full border border-gray-300 rounded px-4 py-3 focus:outline-none focus:border-gray-900 font-mono text-xs"
        rows="6"
        placeholder='{"washing": "...", "ironing": "..."}'
      >{
  "washing": "Machine wash 30°",
  "ironing": "No ironing"
}</textarea>
      <p class="text-xs text-gray-500 mt-1">Enter as JSON object</p>
    </div>

    <div class="flex gap-3">
      <button type="submit" class="bg-gray-900 text-white px-6 py-3 rounded hover:bg-gray-800 font-semibold">
        Save Changes
      </button>
      <button type="button" onclick="toggleEdit('dpp-values')" class="bg-gray-300 text-gray-900 px-6 py-3 rounded hover:bg-gray-400 font-semibold">
        Cancel
      </button>
    </div>
  </form>
</div>
```

**Design notes för Variant:**
- ✅ Samma som Style, men med visuell indikation av inheritance
- ✅ Gränt highlight för överridda fält
- ✅ Gråt highlight för ärvda fält
- ✅ Toggle-checkbox för att aktivera override
- ✅ Side-by-side jämförelse av Style vs Variant-värden
- ✅ Samma Tailwind-klassnamn som befintliga sidor

## 5. Admin UI - Batch Detail (med field planning)

Batch-nivå har sina egna DPP fields (t.ex. supplier, factory, production_date) plus overview av vilka GTIN som ingår och deras inherited values.

```html
<!-- NEW: Batch DPP Values Card -->
<div class="bg-white rounded-lg shadow-md p-8 mb-8">
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-2xl font-bold text-gray-900">Digital Product Passport (Batch)</h2>
    <button onclick="toggleEdit('batch-dpp')" class="bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-800 font-semibold">
      Edit
    </button>
  </div>

  <!-- VIEW MODE -->
  <div id="batch-dpp-view" class="space-y-4">
    <div>
      <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">Supplier</label>
      <p class="text-gray-900 font-semibold">Nudie Vietnam</p>
    </div>
    <div>
      <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">Factory</label>
      <p class="text-gray-900 font-semibold">Hung Yen Factory</p>
    </div>
    <div>
      <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">Production Date</label>
      <p class="text-gray-900 font-semibold">2026-09-01</p>
    </div>
  </div>

  <!-- EDIT MODE -->
  <form id="batch-dpp-edit" class="hidden space-y-6" onsubmit="saveBatchDpp(event)">
    <div>
      <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">Supplier</label>
      <input type="text" class="w-full border border-gray-300 rounded px-4 py-3 focus:outline-none focus:border-gray-900" value="Nudie Vietnam" />
    </div>
    <div>
      <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">Factory</label>
      <input type="text" class="w-full border border-gray-300 rounded px-4 py-3 focus:outline-none focus:border-gray-900" value="Hung Yen Factory" />
    </div>
    <div>
      <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">Production Date</label>
      <input type="date" class="w-full border border-gray-300 rounded px-4 py-3 focus:outline-none focus:border-gray-900" value="2026-09-01" />
    </div>
    <div class="flex gap-3">
      <button type="submit" class="bg-gray-900 text-white px-6 py-3 rounded hover:bg-gray-800 font-semibold">Save</button>
      <button type="button" onclick="toggleEdit('batch-dpp')" class="bg-gray-300 text-gray-900 px-6 py-3 rounded hover:bg-gray-400 font-semibold">Cancel</button>
    </div>
  </form>
</div>

<!-- BATCH PLANNING: GTINs + Their Inherited Fields -->
<div class="bg-white rounded-lg shadow-md p-8">
  <h2 class="text-2xl font-bold text-gray-900 mb-6">Planned GTINs & DPP Inheritance</h2>
  
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-gray-300">
          <th class="text-left py-3 px-4 font-semibold text-gray-900">Product</th>
          <th class="text-left py-3 px-4 font-semibold text-gray-900">Size</th>
          <th class="text-center py-3 px-4 font-semibold text-gray-900">Planned</th>
          <th class="text-center py-3 px-4 font-semibold text-gray-900">Created</th>
          <th class="text-left py-3 px-4 font-semibold text-gray-900">Material (Inherited)</th>
          <th class="text-left py-3 px-4 font-semibold text-gray-900">Care (Inherited)</th>
        </tr>
      </thead>
      <tbody>
        <tr class="border-b border-gray-200 hover:bg-gray-50">
          <td class="py-3 px-4">Classic Tee - B01</td>
          <td class="py-3 px-4">S</td>
          <td class="text-center py-3 px-4">500</td>
          <td class="text-center py-3 px-4">245</td>
          <td class="py-3 px-4 text-xs">
            100% Cotton
            <div class="text-gray-500">från Variant</div>
          </td>
          <td class="py-3 px-4 text-xs">
            <button class="text-blue-600 hover:underline">View</button>
            <div class="text-gray-500">från Variant (override)</div>
          </td>
        </tr>
        <tr class="border-b border-gray-200 hover:bg-gray-50">
          <td class="py-3 px-4">Classic Jeans - Adult</td>
          <td class="py-3 px-4">L32-W30</td>
          <td class="text-center py-3 px-4">300</td>
          <td class="text-center py-3 px-4">150</td>
          <td class="py-3 px-4 text-xs">
            98% Cotton, 2% Elastane
            <div class="text-gray-500">från Style</div>
          </td>
          <td class="py-3 px-4 text-xs">
            <button class="text-blue-600 hover:underline">View</button>
            <div class="text-gray-500">från Style</div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

**Design notes för Batch:**
- ✅ Batch DPP Values i egen card (supplier, factory, production_date etc)
- ✅ Planning table visar vilken GTIN som ingår med inherited fields
- ✅ Visar inheritance-kedja för varje GTIN (från Style eller Variant)
- ✅ Click på "View" för att se full JSON av inheritance-chain
- ✅ Progress bar visar planned vs created SGTIN-mängd
- ✅ Samma Tailwind-klassnamn som befintliga tabeller

## 6. Admin UI - GTIN Detail (leaf-level entity)

GTIN är leaf-nivå innan SGTIN. Den kan överskriva värden från Batch och Style, men har själv ingen nested entities på DPP-nivå (SGTINs får sina egna values).

```html
<!-- GTIN DPP Values Card -->
<div class="bg-white rounded-lg shadow-md p-8">
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-2xl font-bold text-gray-900">Digital Product Passport (GTIN)</h2>
    <button onclick="toggleEdit('gtin-dpp')" class="bg-gray-900 text-white px-4 py-2 rounded hover:bg-gray-800 font-semibold">
      Edit
    </button>
  </div>

  <div class="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
    <p class="text-sm text-blue-900">
      <strong>ℹ️ Inheritance:</strong> Values inherit from Style and Batch unless overridden below
    </p>
  </div>

  <!-- VIEW MODE -->
  <div id="gtin-dpp-view" class="space-y-6">
    
    <!-- FIELD: Material Composition (inherited from Style) -->
    <div class="border-l-4 border-gray-300 pl-4">
      <div class="flex justify-between items-start mb-2">
        <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Material Composition
        </label>
        <span class="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
          EU Required
        </span>
      </div>
      <p class="text-sm text-gray-600 mb-2">Inherited from Style</p>
      <p class="text-gray-900 font-semibold">100% Cotton</p>
    </div>

    <!-- FIELD: Weight (defined at GTIN) -->
    <div class="border-l-4 border-blue-400 pl-4 bg-blue-50">
      <div class="flex justify-between items-start mb-2">
        <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Weight (grams)
        </label>
        <span class="bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-1 rounded">
          Nudie Specific
        </span>
      </div>
      <p class="text-sm text-gray-600 mb-2">Defined at GTIN level</p>
      <p class="text-gray-900 font-semibold">185g</p>
    </div>

  </div>

  <!-- EDIT MODE -->
  <form id="gtin-dpp-edit" class="hidden space-y-6" onsubmit="saveGtinDpp(event)">
    
    <!-- FIELD: Material Composition (inherited, no override shown) -->
    <div class="border-l-4 border-gray-300 pl-4 py-4">
      <div class="flex justify-between items-start mb-4">
        <div>
          <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
            Material Composition
          </label>
          <p class="text-sm text-gray-600 mt-1">From Style: <strong>100% Cotton</strong></p>
        </div>
      </div>
      <p class="text-xs text-gray-500">This field is inherited from Style. Cannot override at GTIN level.</p>
    </div>

    <!-- FIELD: Weight (GTIN-specific) -->
    <div>
      <label class="text-xs text-gray-500 uppercase tracking-wide font-semibold">
        Weight (grams)
      </label>
      <input 
        type="number" 
        id="edit-weight_grams"
        class="w-full border border-gray-300 rounded px-4 py-3 focus:outline-none focus:border-gray-900 mt-2"
        step="0.1"
        value="185"
        placeholder="Enter weight in grams"
      />
    </div>

    <div class="flex gap-3">
      <button type="submit" class="bg-gray-900 text-white px-6 py-3 rounded hover:bg-gray-800 font-semibold">
        Save Changes
      </button>
      <button type="button" onclick="toggleEdit('gtin-dpp')" class="bg-gray-300 text-gray-900 px-6 py-3 rounded hover:bg-gray-400 font-semibold">
        Cancel
      </button>
    </div>
  </form>
</div>
```

**Design notes för GTIN:**
- ✅ Similar layout som Variant (inheritance info, override capability)
- ✅ Men GTIN kan även ha egna fält (som inte är ärvda)
- ✅ Visar inherited fields från Style OCH Batch
- ✅ Samma Tailwind-klassnamn

---

## 7. Flow för att lägga till ett nytt fält

```
1. Admin går till "DPP Fields" tab
   
2. Klickar "+ Add Field"
   
3. Fyller i:
   - Field Key: "component_suppliers"
   - Label: "Component Suppliers"
   - Category: "Nudie"
   - Data Type: "json" (array)
   - Entity Types: ["style", "variant"] ✓
   - Entity Types: ["batch"] ✗
   
4. Klickar "Add Field"
   
5. Fältet är nu i databasen
   
6. Admin går till:
   - Style Detail → fältet dyker upp i "DPP Values"
   - Variant Detail → fältet dyker upp med inheritance-möjlighet
   
7. Admin kan editera värdet direkt på detail-sidan
```

## 8. Implementerings-steg

### Steg 1: Database
```sql
-- Uppdatera field_definitions
ALTER TABLE field_definitions ADD COLUMN entity_types JSON DEFAULT '["style"]';

-- Ny tabell (optional, för metadata)
CREATE TABLE field_metadata (...);
```

### Steg 2: Backend API
```javascript
// routes/api/admin/fields.js
GET /api/admin/fields?entity_types=style,variant,batch,gtin
  → returnera fields för dessa typer, sorterade

// routes/api/admin/dpp-values.js
GET /api/admin/dpp-values/:entity_type/:entity_id
  → returnera sparade värden

GET /api/admin/dpp-values/:entity_type/:entity_id/with-inheritance
  → returnera värden med inheritance info (för Variant, Batch, GTIN, SGTIN)

POST /api/admin/dpp-values/:entity_type/:entity_id
  → spara värden, skapa dpp_values poster
```

### Steg 3: Frontend - Dynamic Form Component
```javascript
// components/DppValuesForm.js
- Hämtar fields från API baserat på entity_type
- Renderar dynamiska inputs (textarea, number, json-editor, array-editor)
- Hanterar inheritance-logik för Variant/Batch/GTIN/SGTIN
- Skapar submit-payload och POSTar till API
- Visuell feedback: grå för ärvda, grön för överridda
```

### Steg 4: Update detail-sidor
```
style-detail.ejs    → inkludera <DppValuesForm entity_type="style" entity_id={id} />
variant-detail.ejs  → inkludera <DppValuesForm entity_type="variant" entity_id={id} />
batch-detail.ejs    → inkludera <DppValuesForm entity_type="batch" entity_id={id} />
gtin-detail.ejs     → inkludera <DppValuesForm entity_type="gtin" entity_id={id} />
sgtin-detail.ejs    → inkludera <DppValuesForm entity_type="sgtin" entity_id={id} />
```

## 9. Fördelar

✅ **En källa till sanningen** - DPP Fields definierar allt
✅ **Konsistent UX** - samma form-style överallt
✅ **Enkelt att utöka** - nytt fält = en rad i databasen
✅ **Inheritance-support** - Variant, Batch, GTIN, SGTIN kan ärva från parent
✅ **Typ-aware inputs** - rätt input-typ per fält
✅ **Skalbar** - lägger inte till GUI-kod för varje nytt fält
✅ **Visuell feedback** - inheritance-highlighting, override-indikatorer

## 10. Nästa steg

1. Uppdatera `field_definitions` tabell med `entity_types` kolumn
2. Implementera backend API-endpoints
3. Skapa DppValuesForm-komponenten
4. Uppdatera Style/Variant/Batch/GTIN/SGTIN detail-sidor
5. Migrera befintliga DPP-värden
6. Testa inheritance-logik för alla entity-typer

---

**Förslag klart för feedback!** 🎯
