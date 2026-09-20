// Shared rendering logic for the public passport, used by BOTH the
// legacy /dpp/:batch/:gtin/:sgtin route and the GS1 Digital Link
// /01/:gtin/21/:serial route (ROADMAP.md Phase 3). Kept in one place
// deliberately - scan logging, locale (?lang=) and the JSON export
// must behave identically on both URLs, not drift apart because one
// route got a fix the other didn't.
const passportResolver = require('./passport-resolver');
const scanService = require('./scan-service');
const fieldRepository = require('../repositories/fields');
const supplyChainRepository = require('../repositories/supply-chain');
const passportVersionRepository = require('../repositories/passport-versions');
const { normalizeToStored, toGtin14 } = require('../utils/gtin');
const { getUser } = require('../middleware/auth');
const { db } = require('../db/init-v2');

// sgtins has UNIQUE(gtin_id, serial_number) - a serial is unique per
// GTIN regardless of batch, so GS1's /01/{gtin}/21/{serial} can find
// the SGTIN without a batch in the URL at all.
//
// gtins.gtin stores the 13-digit EAN as printed on the barcode; a
// real GS1 Digital Link uses the formal 14-digit GTIN (EAN zero-padded
// - see utils/gtin.js). Normalizing here means both /01/0571.../21/1
// (14-digit, GS1-correct) and /01/571.../21/1 (13-digit, matching the
// stored value) resolve the same SGTIN.
function findSgtinByGtinSerial(gtin, serial) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT sg.* FROM sgtins sg
       JOIN gtins g ON g.id = sg.gtin_id
       WHERE g.gtin = ? AND sg.serial_number = ?
       LIMIT 1`,
      [normalizeToStored(gtin), serial],
      (err, row) => (err ? reject(err) : resolve(row))
    );
  });
}

// Legacy lookup, kept for the /dpp/:batch/:gtin/:sgtin route
function findSgtinByBatchGtinSerial(batch, gtin, serial) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT sg.* FROM sgtins sg
       JOIN gtins g ON g.id = sg.gtin_id
       JOIN batches b ON b.id = sg.batch_id
       WHERE b.batch_id = ? AND g.gtin = ? AND sg.serial_number = ?
       LIMIT 1`,
      [batch, gtin, serial],
      (err, row) => (err ? reject(err) : resolve(row))
    );
  });
}

// Union of every locale that has a translation ANYWHERE in the
// passport's chain (SGTIN/GTIN/Batch/Variant/Style) - drives the
// consumer-facing language switcher.
async function getAvailableLocalesForPassport(passport) {
  const levels = [
    ['sgtin', passport.sgtin.id],
    ['gtin', passport.gtin.id],
    ['batch', passport.batch.id],
    ...(passport.variant ? [['variant', passport.variant.id]] : []),
    ['style', passport.style.id]
  ];

  const locales = new Set();
  for (const [entityType, entityId] of levels) {
    const found = await fieldRepository.getAvailableLocales(entityType, entityId);
    found.forEach(l => locales.add(l));
  }
  return Array.from(locales).sort();
}

// Digital Access (2026-09-20): which fields a given role sees, driven
// entirely by the field_roles table (Settings > Digital Access) -
// replaces the old fixed consumer_visible/authority_visible booleans
// so any number of roles can exist without a schema change. Shared
// here (COMPLIANCE.md gap #7's original point still holds) so the HTML
// page and JSON export can't drift apart.
async function filterByRole(resolvedFields, roleId) {
  const visibleKeys = new Set(await fieldRepository.getFieldKeysForRole(roleId));
  return resolvedFields.filter(f => visibleKeys.has(f.fieldKey));
}

// Resolves which role a passport request is asking to view as
// (?role=<role_key>, default the role marked is_default) and enforces
// that role's requires_auth flag - a logged-in user may view a
// protected role only if their account role matches it, or they're an
// admin/super_admin. Returns { role, user, deniedReason } - deniedReason
// is 'login' (send to /login) or 'forbidden' (403), or null if allowed.
async function resolveRoleForRequest(req) {
  const requestedKey = req.query.role || null;
  const role = requestedKey
    ? (await fieldRepository.getRoleByKey(requestedKey)) || (await fieldRepository.getDefaultRole())
    : await fieldRepository.getDefaultRole();

  if (!role || !role.requires_auth) {
    return { role, user: null, deniedReason: null };
  }

  const user = getUser(req);
  if (!user) return { role, user: null, deniedReason: 'login' };
  if (user.role !== role.role_key && user.role !== 'admin' && user.role !== 'super_admin') {
    return { role, user, deniedReason: 'forbidden' };
  }
  return { role, user, deniedReason: null };
}

function getEventsForSgtin(sgtinId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM lifecycle_events WHERE sgtin_id = ? ORDER BY created_at DESC',
      [sgtinId],
      (err, rows) => (err ? reject(err) : resolve(rows || []))
    );
  });
}

// Renders the consumer-facing HTML passport. basePath is the canonical
// URL for THIS route (no query string) - used to build the JSON link
// and the on-page "Passport URL" field without breaking on ?lang=.
// ?role=<role_key> switches which Digital Access role's field set is
// shown (Settings > Digital Access / Field Config) - defaults to the
// role marked is_default. A role with requires_auth needs a matching
// login (or admin/super_admin); scanService.logScan only runs for the
// default, unauthenticated view - an authenticated role lookup isn't a
// consumer scan, same reasoning as the JSON export.
async function renderPassportPage(req, res, sgtinRecord, basePath) {
  const { role, user, deniedReason } = await resolveRoleForRequest(req);
  if (deniedReason === 'login') {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  if (deniedReason === 'forbidden') {
    return res.status(403).send('Your account does not have access to this view.');
  }

  if (!role.requires_auth) {
    await scanService.logScan(sgtinRecord.id, {
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      method: req.query.method || 'qr'
    });
  }

  const locale = req.query.lang || null;
  const passport = await passportResolver.resolveSgtinPassport(sgtinRecord.id, locale);
  passport.resolvedFields = await filterByRole(passport.resolvedFields, role.id);
  const scanStats = await scanService.getScanStats(sgtinRecord.id);
  const events = await getEventsForSgtin(sgtinRecord.id);
  const availableLocales = await getAvailableLocalesForPassport(passport);
  // Supply chain is keyed at Style level for now (ROADMAP.md)
  const supplyChainGroups = await supplyChainRepository.getGroupedForEntity('style', passport.style.id);
  const roles = await fieldRepository.listRoles();

  res.render('dpp-passport', {
    passport,
    scanStats,
    events,
    availableLocales,
    supplyChainGroups,
    url: basePath,
    locale,
    roles,
    currentRole: role,
    currentUser: user
  });
}

// Machine-readable JSON export - defaults to the default role's field
// set (?role= supported the same way as the HTML page), no scan event
// logged (a registry/API pull isn't a consumer scan).
async function renderPassportJson(req, res, sgtinRecord) {
  const { role, deniedReason } = await resolveRoleForRequest(req);
  if (deniedReason) {
    return res.status(deniedReason === 'login' ? 401 : 403).json({ error: 'Authentication required for this role' });
  }

  const locale = req.query.lang || null;
  const passport = await passportResolver.resolveSgtinPassport(sgtinRecord.id, locale);
  const visibleFields = await filterByRole(passport.resolvedFields, role.id);

  const fields = visibleFields
    .filter(f => f.value)
    .map(f => ({
      key: f.fieldKey,
      label: f.label,
      category: f.category,
      value: f.value,
      source: f.source,
      locale: f.locale
    }));

  // Supply chain is keyed at Style level for now (ROADMAP.md), same
  // grouping used by the HTML passport - kept identical so the JSON
  // export never drifts from what the consumer page shows.
  const supplyChainGroups = await supplyChainRepository.getGroupedForEntity('style', passport.style.id);
  const supplyChain = supplyChainGroups.map(group => ({
    category: group.category,
    steps: group.steps.map(step => ({
      label: step.step_label,
      supplier: step.supplier_name,
      city: step.city,
      country: step.country,
      employeeRange: step.employee_range,
      visitedByBrand: !!step.visited_by_brand
    }))
  }));

  // "Last updated" / version come from passport_versions, which is
  // only bumped on direct SGTIN writes (ROADMAP.md) - the same scope
  // that already drives the Version History panel in admin.
  const currentVersion = await passportVersionRepository.getCurrentVersion('sgtin', sgtinRecord.id);

  res.json({
    format: 'ESPR 2024/1781 Digital Product Passport',
    generatedAt: new Date().toISOString(),
    requestedLocale: locale,
    passportVersion: currentVersion ? currentVersion.version_number : 1,
    lastUpdated: currentVersion ? currentVersion.issued_at : passport.sgtin.created_at,
    identifiers: {
      ean: passport.gtin.gtin,
      gtin: toGtin14(passport.gtin.gtin),
      serialNumber: passport.sgtin.serial_number,
      sgtin: passport.sgtin.sgtin,
      styleNumber: passport.style.style_number,
      batchId: passport.batch.batch_id
    },
    product: {
      name: passport.variant?.product_name || passport.style.product_name,
      type: passport.style.product_type,
      size: passport.gtin.size_value_1,
      imageUrl: passport.variant?.image_url || passport.style.image_url
    },
    // country of origin, color, supplier and factory are deliberately
    // NOT read from their old hardcoded columns here - those columns
    // have no inheritance/override/locale/lock support and duplicate
    // the real dynamic fields (country_of_origin, color, supplier,
    // factory), which are already included in `fields` below. Per
    // decision 2026-09-16/2026-09-20: the dynamic field is the single
    // source of truth for all of these.
    manufacturing: {
      productionDate: passport.batch.production_date
    },
    economicOperator: passport.economicOperator ? {
      role: passport.economicOperator.role,
      legalName: passport.economicOperator.legal_name,
      address: passport.economicOperator.address,
      country: passport.economicOperator.country,
      registrationNumber: passport.economicOperator.registration_number,
      source: passport.economicOperator.source
    } : null,
    fields,
    supplyChain
  });
}

module.exports = {
  findSgtinByGtinSerial,
  findSgtinByBatchGtinSerial,
  renderPassportPage,
  renderPassportJson
};
