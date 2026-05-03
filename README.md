# Digital Product Passport (DPP) System

**Nudie Jeans Marketing AB** – A proof-of-concept system for managing product information, batch tracking, and digital product passports with QR codes.

---

## 📋 Översikt

Digital Product Passport (DPP) är ett admin-system för att hantera produktinformation och batchdata för Nudie Jeans. Systemet möjliggör:

- **Produkthierarki:** Styles → (valfritt) Variants → Batches
- **Automatiska passportlänkar:** `/p/[style]-[variant]-[batch]` format
- **Offentlig passportsida:** Visa produktinformation till slutkonsument
- **QR-kod-generering:** Fysiska etiketter för produkter
- **Ändringslogg:** Auditspår för all data-modifiering
- **Livscykelstatus:** Draft → Published → Archived

---

## 🏗️ Arkitektur

### Teknisk Stack
```
Frontend:  EJS Templates + Tailwind CSS (CDN)
Backend:   Node.js + Express
Database:  SQLite
Hosting:   Localhost (localhost:3000)
```

### Databasstruktur
```
styles (stil/produkt)
├── variant_code (3 tecken, valfritt)
├── gtin (13-digit barcode)
└── batches (produktpartier)
    ├── passport_url (auto-generated)
    ├── lifecycle_status (draft/published/archived)
    └── archived (soft delete)

change_log (revisions)
```

---

## 🎯 Implementerad Funktionalitet

### 1. **Admin Dashboard** (`/`)
- **Statistik:** Totala styles, batches, arkiverade batches
- **Recent Changes:** Senaste 10 ändringar med tidsstämpel
- **Recent Batches:** Senaste 5 batches med variant_code
- **Search:** Sök på style_number eller style_name

### 2. **Style Management**
- **Create:** Formulär för ny stil med produktinformation
- **Edit:** Uppdatera style-detaljer (material, ursprungsland, etc.)
- **Properties:**
  - Style Number (unik identifierare)
  - Style Name
  - Product Type
  - Material Composition
  - Supplier
  - Country of Origin
  - Care Instructions
  - Certification (namn + URL)
  - Product Image URL
  - **GTIN** (13-digit barcode)
  - Has Variants (checkbox)
- **Delete:** Ta bort style och associerade batches

### 3. **Variant Management** (för styles med varianter)
- **3-Character Codes:** ANT, ECR, B30, C52, etc.
- **Create:** Lägg till variant med namn och bild
- **Edit:** Uppdatera variant-information
- **Delete:** Tar bort variant och dess batches (kaskad)
- **Images:** Stöd för variant-specifika produktbilder

### 4. **Batch Management**
- **Create:** Nytt batch med auto-genererad passport-URL
  - Format: `/p/[style]-[batch]` eller `/p/[style]-[variant]-[batch]`
- **Edit:** Uppdatera batch-information
  - Validering: Duplikat batch_number detekteras → inline felmeddelande
  - Passport URL regenereras automatiskt baserat på batch_number
- **Status Management:**
  - Draft → Published → Archived (dropdown-meny)
  - Livscykeltatus sparas i database
- **Archive:** Soft delete (sätter archived=1)
- **Properties:**
  - Batch Number (unik per style)
  - Production Date
  - Quantity
  - Material Composition (override style-värde)
  - Supplier (override style-värde)
  - Recycling Information

### 5. **Public Passport Page** (`/p/:passport`)
- **URL Format:** 
  - Style ohne variant: `/p/114539-1015893`
  - Style med variant: `/p/131888-B30-1015992`
- **Innehål:**
  - Produktbild
  - Produktinformation (material, ursprungsland, leverantör)
  - Batch-specifik info (produkt-datum, kvantitet)
  - Certifieringar med länk
  - Återvinningsinformation
  - Originalbatch-nummer
- **Access:** Offentlig (ingen autentisering)

### 6. **QR Code Labels** (`/batches/:batch_id/qr-labels`)
- **Format:** 5cm × 3cm per etikett, 4 per A4-sida
- **Innehål:** QR-kod som pekar på public passport-sida
- **PDF-generering:** Nedladdningsbar etikettsida

### 7. **Change Log & Audit Trail**
- **Tracked Events:**
  - Create batch
  - Update batch
  - Status change
  - Archive
- **Information:** Datum, tid, ändringstyp, beskrivning
- **Visning:** 
  - Batch-detail-sida (full historia)
  - Dashboard (senaste 10)

---

## 🚀 Kom Igång

### Installation
```bash
# Clone repo
git clone https://github.com/SandraHanssonGit/ddp-local.git
cd ddp-local

# Install dependencies
npm install

# Seed database med test-data
node scripts/seed.js

# Start server
npm start
```

Server kör på **http://localhost:3000**

### Test Data
- 3 styles (Jeans, T-Shirt, Linen Shirt)
- 2 variants (Antracite, Ecru)
- 5 batches
- Sample GTINs och bilder

---

## 📊 Databaskonfiguration

### Styles Table
```sql
CREATE TABLE styles (
  style_id INTEGER PRIMARY KEY,
  style_number TEXT UNIQUE NOT NULL,
  style_name TEXT NOT NULL,
  product_type TEXT NOT NULL,
  material_composition TEXT,
  supplier TEXT,
  country_of_origin TEXT,
  care_instructions TEXT,
  certification_name TEXT,
  certification_url TEXT,
  image_url TEXT,
  gtin TEXT,
  has_variants INTEGER DEFAULT 0,
  created_at DATETIME,
  updated_at DATETIME
)
```

### Batches Table
```sql
CREATE TABLE batches (
  batch_id INTEGER PRIMARY KEY,
  style_id INTEGER NOT NULL,
  variant_id INTEGER,
  batch_number TEXT UNIQUE NOT NULL,
  production_date DATE,
  quantity INTEGER,
  material_composition TEXT,
  supplier TEXT,
  recycling_info TEXT,
  passport_url TEXT,
  status TEXT DEFAULT 'active',
  lifecycle_status TEXT DEFAULT 'draft',
  archived INTEGER DEFAULT 0,
  created_at DATETIME,
  updated_at DATETIME
)
```

---

## 🔗 API Routes

### Styles
- `GET /styles/new` – Create form
- `GET /styles/:style_id` – Style detail + variants/batches
- `GET /styles/:style_id/edit` – Edit form
- `POST /styles` – Create style
- `POST /styles/:style_id` – Update style
- `POST /styles/:style_id/delete` – Delete style

### Variants
- `GET /variants/:variant_id` – Variant detail + batches
- `GET /variants/:variant_id/edit` – Edit form
- `POST /variants` – Create variant
- `POST /variants/:variant_id` – Update variant
- `POST /variants/:variant_id/delete` – Delete variant

### Batches
- `GET /batches/:batch_id` – Batch detail
- `GET /batches/:batch_id/edit` – Edit form
- `POST /batches` – Create batch
- `POST /batches/:batch_id` – Update batch (validation + auto-URL)
- `POST /batches/:batch_id/status` – Change lifecycle status
- `POST /batches/:batch_id/delete` – Archive batch
- `GET /batches/:batch_id/qr-labels` – Generate QR code PDF

### Public
- `GET /p/:passport` – Public passport page

---

## ✅ Lösta Problem

| Problem | Lösning |
|---------|---------|
| Express route-ordning | Specifika routes innan generiska parameter-routes |
| Database-schema-uppdateringar | DROP TABLE i seed.js för clean rebuild |
| Varianter i queries | LEFT JOIN för optional-relationer |
| Passport-URL-parsing | Direktsökning på lagrad `passport_url` |
| Duplikat batch_number | Inline-validering med highlighting, samma sida |
| Batch_number-uppdatering | Passport URL regenereras automatiskt |
| Variant-synlighet | Variant_code i Recent Batches-lista |
| EJS template-fel | Defensiv variabelhantering |

---

## 🛣️ Vägen Till Enterprise-Lösning

### Fas 1: **Grundläggande Enterprise** (2-4 veckor)

#### 🔒 Säkerhet & Autentisering
- [ ] JWT-baserad autentisering
- [ ] Rolle-baserad åtkomstkontroll (RBAC)
  - Admin: Full access
  - Editor: Skapa/redigera styles & batches
  - Viewer: Läs-access bara
- [ ] Password hashing (bcrypt)
- [ ] Session management
- [ ] CSRF-skydd på formulär

#### 📊 Data & Integration
- [ ] REST API-endpoints för externa system
- [ ] Batch-import via CSV/Excel
- [ ] API-dokumentation (Swagger/OpenAPI)
- [ ] Rate limiting & API-keys för 3rd-party integrationer

#### 🗄️ Database
- [ ] Migrera från SQLite till PostgreSQL
- [ ] Database-indexering (batch_number, style_number, passport_url)
- [ ] Backup-strategi (dagliga backups)
- [ ] Connection pooling

---

### Fas 2: **Skalbarhet & Performance** (1-2 månader)

#### ⚡ Caching & CDN
- [ ] Redis-caching för ofta tillfrågade passports
- [ ] CDN för statiska assets & produktbilder
- [ ] Session-caching

#### 📈 Observability
- [ ] Monitoring (Prometheus, Datadog)
- [ ] Logging aggregation (ELK, CloudWatch)
- [ ] Error tracking (Sentry)
- [ ] Performance metrics

#### 🔄 CI/CD
- [ ] GitHub Actions för automated testing
- [ ] Automated deployment pipeline
- [ ] Staging & production environments
- [ ] Database migration automation

---

### Fas 3: **Funktionalitet & UX** (2-3 månader)

#### 📱 Gränssnitt
- [ ] Responsive design (mobile-optimerad)
- [ ] Bulk-operationer (mass-uppdatera status)
- [ ] Avancerad filtrering (datum-intervall, status, variant)
- [ ] Export: PDF, JSON, CSV
- [ ] Undo/redo för ändringar
- [ ] Dark mode

#### 📊 Analytics & Reporting
- [ ] Dashboard-widgets (trends, status-fördelning)
- [ ] Batch-livscykel-analys
- [ ] Leverantörkvalitet-rapport
- [ ] Audit-rapport med user-tracking

#### 🌐 Internationalisering
- [ ] Flertal språk (English, Svenska, German, French)
- [ ] Lokalisering av datum, valuta, mätenheter
- [ ] Unicode-stöd

---

### Fas 4: **Integrationer & Ecosystem** (3+ månader)

#### 🔌 Integrations
- [ ] E-commerce integration (Shopify, WooCommerce)
- [ ] ERP-integration (SAP, NetSuite)
- [ ] Inventory management system
- [ ] Webhook-stöd för event-notifikationer
- [ ] GraphQL API-alternativ

#### 🏭 B2B Features
- [ ] Multi-tenant support (multiple brands)
- [ ] Brand-specifika custom fields
- [ ] Self-service brand portal
- [ ] Batch-tracking för retailers

#### 📱 Mobile
- [ ] Native iOS/Android app
- [ ] Offline-läge
- [ ] QR-scanning för batch-verifikation

---

## 🧪 Quality Assurance

- [ ] Unit tests (Jest/Mocha) – minst 80% coverage
- [ ] Integration tests
- [ ] E2E tests (Cypress/Playwright)
- [ ] Load testing (k6, JMeter)
- [ ] Security testing (OWASP, dependency scanning)
- [ ] Accessibility testing (WCAG 2.1)

---

## 🚢 Deployment

**Rekommenderade plattformar:**
- **AWS** – EC2 + RDS + CloudFront
- **Google Cloud** – App Engine + Cloud SQL
- **Azure** – App Service + SQL Database
- **Railway/Render** – Enklaste för PoC→staging
- **Docker + Kubernetes** – För skalning

**Infrastruktur som kod:**
- [ ] Terraform/CloudFormation för IaC
- [ ] Docker containerization
- [ ] Kubernetes orchestration

---

## 📚 Dokumentation Behövs

- [ ] API-dokumentation (OpenAPI/Swagger)
- [ ] Användarmanualer
- [ ] Admin setup-guide
- [ ] Troubleshooting-guide
- [ ] Arkitektur-dokumentation
- [ ] Database schema-dokumentation
- [ ] Deployment guide

---

## 🎯 Next Steps (Nästa Iteration)

**För MVP-feedback:**
1. Deploy till Railway eller Render för public access
2. Samla feedback från stakeholders
3. Prioritera features baserat på feedback

**För Fas 1 (Enterprise):**
1. Implementera JWT-autentisering
2. Migrera till PostgreSQL
3. Bygga REST API
4. Implementera RBAC

**För långsiktig vision:**
1. Multi-tenant support
2. E-commerce integrations
3. Analytics & reporting
4. Mobile app

---

## 📝 Commits

```
072ecf5 Add GTIN field at style level
ccb888d Implement batch validation, passport URL routing, and variant visibility
3fe87dd Initial project setup
```

---

## 👤 Kontakt

**Nudie Jeans Marketing AB**
- Email: sandra.hansson@nudiejeans.com
- GitHub: [SandraHanssonGit](https://github.com/SandraHanssonGit)

---

**Status:** PoC är fungerande med core-features. System är redo för user-testing och feedback-iteration innan enterprise-hardening.

---

*Skapad med Node.js, Express, SQLite & Tailwind CSS*
