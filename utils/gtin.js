// GS1 formally defines a GTIN as always 14 digits. What we store in
// gtins.gtin is the 13-digit EAN/UCC-13 code actually printed on the
// product's barcode - a GTIN-13. Converting GTIN-13 -> GTIN-14 is just
// left-padding with a single "0" (indicator digit 0 = no packaging
// level). Kept as a derived display value, not stored, so there is
// nothing to keep in sync.
function toGtin14(ean) {
  const digits = String(ean || '').trim();
  return digits.padStart(14, '0');
}

// Accepts a GTIN path segment that may be 13 or 14 digits (a real GS1
// resolver URL uses 14; our stored value is 13) and returns the form
// matching what's actually in gtins.gtin, by stripping a leading "0"
// if present. Only strips one leading zero (14 -> 13 digits), so a
// genuinely 13-digit input passes through unchanged.
function normalizeToStored(gtinParam) {
  const digits = String(gtinParam || '').trim();
  return digits.length === 14 && digits[0] === '0' ? digits.slice(1) : digits;
}

module.exports = { toGtin14, normalizeToStored };
