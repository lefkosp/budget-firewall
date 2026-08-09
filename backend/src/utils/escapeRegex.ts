/**
 * Escapes regex metacharacters so a string can be dropped into `new RegExp`
 * (or a Mongo `$regex`) and matched literally. Without this, a search term
 * containing `.`, `*`, `(`, `|`, etc. is interpreted as a pattern rather
 * than literal text -- at best a confusing "no results" for a merchant name
 * that happens to contain a special character, at worst a ReDoS via a
 * pathological pattern (e.g. many nested quantifiers) or a filter bypass
 * (e.g. `.*` matching everything regardless of the intended search term).
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
