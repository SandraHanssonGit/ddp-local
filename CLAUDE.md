# DPP Local v2 – Claude Code Project Instructions

## 1. Project Purpose

This project is a local Proof of Concept for a Digital Product Passport (DPP) platform for Nudie Jeans.

The purpose of the POC is to validate the core DPP architecture and data model before building a production solution integrated with company systems such as Infor M3, PIM/PLM, identity systems, external services, and future EU DPP infrastructure.

The POC runs entirely on a local Windows development machine.

The system must demonstrate:

- hierarchical product data
- Style → Batch → GTIN → SGTIN relationships
- data inheritance between levels
- field-level overrides
- configurable DPP fields
- EU-required vs. Nudie-specific fields
- field-level audit history
- individual garment lifecycle events
- public consumer-facing Digital Product Passports
- unique URLs for individual garments
- QR/RFID/SGTIN identifiers

The architecture should remain simple enough for a local POC while keeping the domain model suitable for a future enterprise implementation.

---

## 2. Technology Stack

Use the existing project stack.

Backend:

- Node.js
- Express
- JavaScript
- SQLite

Frontend:

- server-rendered EJS
- HTML
- Tailwind CSS
- minimal native JavaScript

Do NOT introduce:

- Python
- React
- Vue
- Angular
- TypeScript
- Docker
- PostgreSQL
- ORMs
- microservices
- cloud dependencies

unless explicitly requested.

The POC should remain easy to run locally.

Prefer simple, readable JavaScript over framework abstractions.

---

## 3. Core Domain Model

The most important architectural rule is the DPP hierarchy:

    Style
      ↓
    Batch
      ↓
    GTIN
      ↓
    SGTIN

These are separate domain entities.

Do not collapse these levels into a single table.

### 3.1 Style

Style represents the master product definition.

Examples:

- style number
- product name
- product type
- default fiber composition
- default care instructions
- sustainability information
- durability information
- product storytelling

Style-level DPP data is inherited by all entities below the Style unless overridden.

### 3.2 Batch

Batch represents a specific production batch belonging to a Style.

A Batch MUST belong to exactly one Style.

Batch may contain production-specific information such as:

- production order
- production date
- supplier
- factory
- country of production
- dye lot
- production-specific material information

Batch inherits DPP fields from Style and may override individual Style fields.

Do NOT duplicate all Style fields into Batch when creating a Batch.

Only explicit Batch values/overrides should be stored at Batch level.

### 3.3 GTIN

GTIN represents a trade item / product variant within a Batch.

GTIN MUST belong to one Batch.

Examples of GTIN-specific data:

- GTIN/EAN
- size
- color
- variant
- weight
- size-specific information

GTIN inherits values from Style and Batch and may override individual inherited fields.

GTIN must be represented as its own entity/table.

Do NOT store GTIN only as a property on SGTIN.

### 3.4 SGTIN

SGTIN represents an individual physical garment.

SGTIN MUST belong to one GTIN.

SGTIN may contain:

- serial number
- SGTIN identifier
- RFID identifier
- QC information
- individual measurements
- special markings
- individual product information

SGTIN inherits DPP values from Style, Batch and GTIN and may override individual inherited fields.

SGTIN is also the entity that owns the garment lifecycle.

---

## 4. Example Complete Hierarchy

    Style 114519
    ├
    ├── Batch PO45001234
    │   ├
    │   ├── GTIN 05707141145391
    │   │   ├── SGTIN ABC001
    │   │   ├── SGTIN ABC002
    │   │   ├── SGTIN ABC003
    │   │
    │   ├── GTIN 05707141145407
    │       ├── SGTIN ABC004
    │       ├── SGTIN ABC005
    │
    ├── Batch PO45001345

The UI and database must preserve this hierarchy.

---

## 5. Database Architecture

Use SQLite.

The core entity tables should conceptually be:

    styles
    batches
    gtins
    sgtins

Recommended relationships:

    styles.id
        ↓
    batches.style_id

    batches.id
        ↓
    gtins.batch_id

    gtins.id
        ↓
    sgtins.gtin_id

Use foreign keys.

Use indexes on identifiers commonly used for lookup.

---

## 6. Dynamic DPP Field System

Do NOT create a database column for every DPP attribute.

DPP requirements will evolve.

Instead use configurable field definitions.

---

## 7. Field Definitions

Create a generic field definition model.

Conceptually:

    field_definitions

Suggested properties:

    id
    field_key
    label
    description
    data_type
    category
    required
    consumer_visible
    valid_from
    valid_until
    sort_order
    created_at
    updated_at

field_key must be stable and machine-readable.

Examples:

    fiber_composition
    care_instructions
    durability
    country_of_origin
    substances_of_concern
    repair_program
    secondhand_program

---

## 8. Field Categories

DPP fields must be configurable by category.

Initial categories:

    eu_required
    nudie

Do NOT hard-code EU/Nudie presentation logic into templates.

Templates should use field configuration.

This allows a field to move from Nudie-specific to EU-required without database schema changes.

---

## 9. Generic DPP Values

Use a generic value system.

Conceptually:

    dpp_values

Suggested structure:

    id
    field_definition_id
    entity_type
    entity_id
    value
    source_system
    created_by
    created_at
    updated_at

entity_type must support:

    style
    batch
    gtin
    sgtin

A value stored on an entity means that entity defines or overrides that field.

Do NOT copy inherited values into lower levels.

---

## 10. Inheritance Rules

Inheritance is a central business rule.

For an SGTIN, resolve every field using this precedence:

    SGTIN
      ↓
    GTIN
      ↓
    Batch
      ↓
    Style

The closest explicitly defined value wins.

---

## 11. Passport Resolver

Inheritance logic MUST NOT be implemented independently inside routes or templates.

Create a dedicated service.

Suggested file:

    services/passport-resolver.js

Conceptual API:

    resolvePassport(sgtinId)

It should:

1. Load SGTIN
2. Load GTIN
3. Load Batch
4. Load Style
5. Load active field definitions
6. Load DPP values for all four levels
7. Resolve inheritance
8. Determine source level for every field
9. Determine whether each value is inherited or overridden
10. Return a structured resolved passport

Routes and templates should consume the resolved result.

They should not implement inheritance logic themselves.

---

## 12. Field-Level Audit Trail

Every change to DPP field values must be traceable.

Create:

    field_change_log

Suggested fields:

    id
    change_id
    field_definition_id
    entity_type
    entity_id
    action
    old_value
    new_value
    user_id
    reason
    source_system
    created_at

Supported actions should include:

    created
    updated
    overridden
    removed

Every modification through the application must generate an audit entry.

Audit history should be append-only.

Do NOT silently overwrite DPP values without recording the previous value.

---

## 13. Change Reasons

The architecture should support a reason for a change.

The POC UI may make the reason optional initially, but the data model must support it.

---

## 14. Source Systems

Every DPP value should be able to identify its origin.

Examples:

    manual
    m3
    pim
    plm
    qc
    api
    import

The local POC will primarily use:

    manual

Do not implement real M3/PIM integrations yet.

Design the model so integrations can populate the same field/value system later.

---

## 15. Lifecycle Events

DPP field history and garment lifecycle events are different concepts.

Do NOT combine them.

Field change history answers:

    "How did the DPP data change?"

Lifecycle history answers:

    "What happened to this physical garment?"

Create or retain a lifecycle event model.

Conceptually:

    lifecycle_events

Fields:

    id
    sgtin_id
    event_type
    event_data
    source_system
    created_by
    created_at

Possible event types:

    manufactured
    sold
    repaired
    resold
    returned
    recycled

Lifecycle events belong to SGTIN and should be append-only.

---

## 16. Public Digital Product Passport

Every SGTIN should have a unique public passport URL.

For the local POC use a structure similar to:

    /dpp/{style}/{batch}/{serial}

Example:

    http://localhost:3000/dpp/114519/PO45001234/ABC001

The public route must resolve the SGTIN and use the Passport Resolver.

It should NOT assemble raw values directly from database tables.

---

## 17. Consumer Presentation

The consumer DPP should present the resolved passport.

The consumer should not need to understand database inheritance.

Fields should be grouped according to configuration.

The EU/Nudie badges must be driven by field configuration.

---

## 18. Admin UI

The admin UI should make the hierarchy obvious.

Suggested navigation:

    Styles
      ↓
    Style Details
      ↓
    Batches
      ↓
    Batch Details
      ↓
    GTINs
      ↓
    GTIN Details
      ↓
    SGTINs

At each level display:

    Defined here
    Inherited
    Overridden

For inherited fields, show where the value comes from.

---

## 19. Editing Inherited Fields

Editing an inherited value at a lower level MUST create an override.

It must NOT modify the parent value.

---

## 20. Removing Overrides

The system should support removing an override.

When an override is removed, the entity should automatically inherit the next available parent value.

The removal must be recorded in the audit log.

---

## 21. API Architecture

Keep routes thin.

Routes should:

- validate request data
- call services/repositories
- return/render results

Routes should NOT contain:

- inheritance algorithms
- large SQL queries
- audit logic
- business rules

Suggested organization:

    routes/
        admin/
        api/
        public.js

    services/
        passport-resolver.js
        field-service.js
        audit-service.js
        lifecycle-service.js

    repositories/
        styles.js
        batches.js
        gtins.js
        sgtins.js
        fields.js

---

## 22. Database Migrations

Do not continue growing one large database initialization file.

Use simple numbered SQL migrations.

Example:

    db/
      database.js

      migrations/
        001-core-entities.sql
        002-field-definitions.sql
        003-dpp-values.sql
        004-field-change-log.sql
        005-lifecycle-events.sql

      seeds/
        demo-data.js

Keep migrations simple and understandable.

No migration framework is required for the POC unless clearly beneficial.

---

## 22.1 Development Database Isolation

DPP v2 MUST NOT use, modify, migrate, reset, or delete the SQLite database used by the existing v1 application.

The existing v1 application on the `main` branch must remain runnable with its existing data.

Development of v2 takes place on the:

    dpp-v2

Git branch.

The branches represent:

    main
        Existing working DPP v1

    dpp-v2
        New DPP v2 architecture

The v2 database schema is substantially different from v1 and therefore requires a separate SQLite database.

Never run v2 migrations against the v1 database.

---

## 22.2 V2 Database

Create a separate local SQLite database for v2.

Suggested name:

    data/dpp-v2.db

If the current application uses another location for SQLite databases, follow the existing project convention while maintaining complete separation between v1 and v2.

The database path should be configurable rather than duplicated throughout the application.

For example:

    DB_PATH=data/dpp-v2.db

All v2 migrations, seeds, development data, schema changes and experiments must operate exclusively against the v2 database.

---

## 22.3 Database Files and Git

Local SQLite database files should normally NOT be committed to Git.

Ensure the relevant database files are covered by `.gitignore`.

For example:

    *.db
    *.db-shm
    *.db-wal

Do not remove an existing tracked database file without first inspecting how the current v1 application uses it.

The goal is to protect the existing v1 environment, not accidentally alter it while cleaning up the repository.

---

## 22.4 Branch Safety

Before making architectural or database changes, verify that the current Git branch is:

    dpp-v2

If the current branch is:

    main

do NOT perform v2 schema migrations or architectural changes.

Inform the developer that v2 work should be performed on the `dpp-v2` branch.

Claude must never intentionally modify `main`, merge `dpp-v2` into `main`, or push changes unless explicitly instructed.

---

## 22.5 Switching Between V1 and V2

The developer should be able to switch between versions using Git.

V1:

    git checkout main
    npm start

V2:

    git checkout dpp-v2
    npm start

Only one version needs to run at a time.

Switching branches changes the application source code.

Each version must use its corresponding database.

Stopping the running Node process before switching branches is recommended.

---

## 22.6 Protect Existing POC Data

Existing v1 POC data should be treated as valuable test data.

Do NOT:

- reset the v1 database
- recreate its schema
- migrate it automatically
- rename it
- delete it
- seed over it
- use it for v2 development

without explicit approval.

If existing v1 data becomes useful for testing v2, create an explicit import/migration process later.

Do not make v2 dependent on the v1 database.

---

## 22.7 V1-to-V2 Migration Is a Separate Concern

Building the v2 architecture and migrating existing v1 data are two different tasks.

Initially:

    Build clean v2 schema
            ↓
    Seed v2 demo data
            ↓
    Test hierarchy/inheritance
            ↓
    Validate architecture

Only after the v2 model is working should we consider:

    v1 database
        ↓
    migration/import script
        ↓
    v2 database

Do not design the initial v2 schema around preserving compatibility with the old database structure.

The domain model defined in this CLAUDE.md is the source of truth for v2.

---

## 23. Demo Data

Provide realistic demo data.

At minimum:

    2 Styles

Each Style:

    2 Batches

Each Batch:

    multiple GTINs

Each GTIN:

    multiple SGTINs

Demo data must demonstrate inheritance.

One Batch should override a Style-level field.

One SGTIN should have an individual override.

This makes the inheritance model testable from the UI.

---

## 24. Existing v1 Code

Do not automatically delete working v1 functionality.

Before changing existing functionality:

1. understand what it currently does
2. determine whether it maps to the v2 domain model
3. migrate reusable functionality
4. remove obsolete functionality only when replacement exists

Useful existing concepts include:

- authentication
- admin UI
- Tailwind styling
- public passport page
- QR generation
- RFID/SGTIN support
- lifecycle/event functionality
- SQLite setup

Prefer incremental refactoring over unnecessary rewrites.

---

## 25. Important Architectural Rules

These rules must not be violated without explicit approval.

### Rule 1
A Batch belongs to exactly one Style.

### Rule 2
A GTIN belongs to exactly one Batch.

### Rule 3
An SGTIN belongs to exactly one GTIN.

### Rule 4
DPP field definitions are configurable. Do not represent every DPP field as a fixed database column.

### Rule 5
Do not duplicate inherited values. Store only values explicitly defined at a level.

### Rule 6
Inheritance precedence is:

    SGTIN > GTIN > Batch > Style

### Rule 7
Every DPP value modification must be auditable.

### Rule 8
Lifecycle events and field changes are separate systems.

### Rule 9
Public passport rendering must use the Passport Resolver.

### Rule 10
Do not introduce enterprise infrastructure into the POC unless explicitly requested.

### Rule 11
V2 must never alter or migrate the v1 database.

---

## 26. EU DPP Integration

The architecture should be prepared for future EU DPP integration, but do NOT implement the external registry integration during the initial POC unless explicitly requested.

Future requirements may include:

- Unique Product Identifier
- EU Registry registration
- JSON/XML export
- API integration
- compliance validation
- regulatory field configuration

Keep these concerns separated from the core product hierarchy.

---

## 27. Future Enterprise Integration

The future production solution may integrate with:

- Infor M3
- PIM
- PLM
- supplier systems
- QC systems
- RFID infrastructure
- Nudie Jeans web platform
- repair systems
- secondhand systems
- EU DPP infrastructure

The POC should not simulate these systems unnecessarily.

Instead, use `source_system` and clean service boundaries so future integrations can supply data.

---

## 28. Security

The local POC does not require enterprise-grade authentication.

However:

- public passport routes must be read-only
- admin modification routes must require authentication
- never expose passwords
- never expose internal audit information on consumer pages unless explicitly intended
- validate user input
- use parameterized SQL queries

---

## 29. Coding Style

Prefer:

- small functions
- descriptive names
- explicit code
- async/await
- parameterized SQL
- clear separation between routes, services and repositories

Avoid:

- unnecessary abstractions
- clever metaprogramming
- large monolithic files
- duplicated business logic
- business logic inside EJS templates
- SQL scattered throughout route files

Comments should explain WHY, not restate obvious code.

---

## 30. How Claude Should Work

Before making a significant architectural change:

1. inspect the existing relevant code
2. explain what currently exists
3. identify affected files
4. propose the change
5. explain migration impact
6. then implement

Do not redesign unrelated parts of the application.

Prefer small, reviewable changes.

After each significant change:

1. run the application
2. check for startup errors
3. test the affected routes
4. verify database migration
5. verify existing functionality
6. summarize what changed

---

## 31. Git Workflow

Development should occur on a dedicated v2 branch:

    dpp-v2

Make focused commits.

Examples:

    feat: add GTIN entity
    feat: add configurable DPP fields
    feat: implement hierarchical inheritance
    feat: add field audit trail
    refactor: migrate serials to SGTIN hierarchy

Do not combine unrelated architectural changes into one large commit.

Do not push or merge unless explicitly requested.

---

## 32. Initial v2 Implementation Order

Do NOT attempt to rebuild the entire application in one step.

### Phase 1 – Core hierarchy

Create:

    Style
      ↓
    Batch
      ↓
    GTIN
      ↓
    SGTIN

Verify CRUD and relationships.

### Phase 2 – Dynamic fields

Implement:

    field_definitions
    dpp_values

Allow fields to be defined at Style level.

### Phase 3 – Inheritance

Implement:

    passport-resolver.js

Verify:

    SGTIN > GTIN > Batch > Style

### Phase 4 – Overrides

Allow Batch, GTIN and SGTIN to override inherited values.

Allow overrides to be removed.

### Phase 5 – Audit

Implement:

    field_change_log

Record all field modifications.

### Phase 6 – Consumer DPP

Update public passport rendering to use the resolver.

### Phase 7 – Lifecycle

Migrate/extend existing event functionality to:

    lifecycle_events

### Phase 8 – Configuration UI

Create admin configuration for:

- DPP fields
- EU/Nudie category
- required status
- visibility
- ordering

---

## 33. Definition of Successful POC

The POC is successful when the following scenario works:

1. Administrator creates Style 114519.
2. Administrator defines Style-level DPP data.
3. Administrator creates Batch PO45001234.
4. Batch automatically inherits Style data without copying it.
5. Administrator overrides one field at Batch level.
6. Administrator creates multiple GTINs under the Batch.
7. GTINs inherit Style + Batch data.
8. Administrator creates SGTINs under each GTIN.
9. Each SGTIN receives a unique public DPP URL.
10. Public passport correctly displays the resolved data.
11. UI can show whether values originate from Style, Batch, GTIN or SGTIN.
12. Administrator can inspect field-level change history.
13. Administrator can remove an override and inheritance resumes.
14. Lifecycle events can be added to an individual SGTIN.
15. EU-required and Nudie-specific fields are driven by configuration rather than hard-coded templates.

If these scenarios work, the architecture is ready for evaluation before enterprise integration.

---

## 34. Guiding Principle

This POC is not primarily a website project.

It is a test of the Digital Product Passport domain model.

The most important things to get right are:

    hierarchy
    inheritance
    overrides
    identifiers
    field configuration
    auditability
    lifecycle history

Keep the implementation simple, but do not compromise these domain concepts for short-term coding convenience.
