/**
 * Normalizes a raw bank description into a clean, comparable merchant name.
 *
 * Bank descriptions carry a lot of noise that varies per transaction for the
 * same merchant -- payment-method prefixes, store/reference numbers, city
 * suffixes, payment-processor wrappers. Stripping it means the categorizer
 * and any merchant grouping see one stable name per merchant.
 *
 * Order matters: prefixes and processor wrappers come off before the generic
 * trailing-reference cleanup, so we aren't matching against noise.
 */

/** Payment-processor wrappers: "PAYPAL *STEAM" is really a Steam purchase. */
const PROCESSOR_PREFIXES = [
  /^paypal\s*\*\s*/i,
  /^sq\s*\*\s*/i, // Square
  /^sumup\s*\*\s*/i,
  /^izettle\s*\*\s*/i,
  /^stripe\s*\*\s*/i,
];

/** Payment-method prefixes the bank adds, not part of the merchant name. */
const PAYMENT_PREFIXES = [
  /^card payment\s+to\s+/i,
  /^pos payment\s+to\s+/i,
  /^online payment\s+to\s+/i,
  /^payment\s+to\s+/i,
  /^direct debit\s+(to\s+)?/i,
  /^recurring payment\s+to\s+/i,
];

/**
 * Merchants whose raw descriptions vary so much that pattern-stripping alone
 * won't converge them. Matched against the partially-cleaned string.
 */
const MERCHANT_ALIASES: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^amzn\b|^amazon\b/i, name: "amazon" },
  { pattern: /^uber\s*eats\b/i, name: "uber eats" },
  { pattern: /^uber\b(?!\s*eats)/i, name: "uber" },
  { pattern: /^gplay\b|^google\s*play\b/i, name: "google play" },
  { pattern: /^apple\.com\/bill\b|^apple\s*com\s*bill\b/i, name: "apple" },
];

export function normalizeMerchant(rawDescription: string): string {
  if (!rawDescription) return "";

  let normalized = rawDescription.trim();

  // Processor wrappers first -- "PAYPAL *NETFLIX" should become "netflix",
  // not be mistaken for a PayPal transaction.
  for (const pattern of PROCESSOR_PREFIXES) {
    normalized = normalized.replace(pattern, "");
  }

  for (const pattern of PAYMENT_PREFIXES) {
    normalized = normalized.replace(pattern, "");
  }

  // Strip a trailing city/country suffix: ", DUBLIN" / ", MALTA" / ", DE".
  // Runs while casing is intact, which is what the previous implementation
  // got wrong -- it lowercased first, so its uppercase pattern never matched.
  normalized = normalized.replace(/,\s*[A-Za-z][A-Za-z\s.]*$/, "");

  normalized = normalized.toLowerCase().trim();

  for (const { pattern, name } of MERCHANT_ALIASES) {
    if (pattern.test(normalized)) {
      return name;
    }
  }

  // Reference codes after an asterisk: "merchant*2K4XY8901".
  normalized = normalized.replace(/\s*\*\s*\S+$/, "");

  // Trailing store/reference numbers, "#"-prefixed ones ("SAPPS #06") are
  // unambiguous regardless of length -- the "#" itself signals "this is a
  // store number," so even a 2-digit one is safe to strip. Bare digits with
  // no marker need 3+ ("uber eats 8829301") since a short bare number is
  // more likely to be part of the merchant name than a store code.
  normalized = normalized.replace(/\s+#\s?\d+$/, "");
  normalized = normalized.replace(/\s+\d{3,}$/, "");

  // Legal-entity suffixes that add nothing for matching.
  normalized = normalized.replace(
    /\s+(ltd|limited|llc|inc|gmbh|b\.?v\.?|s\.?a\.?r\.?l\.?|plc)\.?$/i,
    ""
  );

  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}
