/**
 * Normalizes merchant names from raw transaction descriptions.
 * Simple MVP implementation: lowercase, trim, remove common noise.
 */
export function normalizeMerchant(rawDescription: string): string {
  if (!rawDescription) return "";

  let normalized = rawDescription.toLowerCase().trim();

  // Remove common prefixes/suffixes
  const noisePatterns = [
    /^card payment\s+to\s+/i,
    /^pos payment\s+to\s+/i,
    /^online payment\s+to\s+/i,
    /^payment\s+to\s+/i,
    /,\s*[A-Z]{2,3}$/, // Remove country codes at end (e.g., ", DUBLIN", ", MALTA")
    /\s+online$/i,
    /\s+pos$/i,
  ];

  for (const pattern of noisePatterns) {
    normalized = normalized.replace(pattern, "");
  }

  // Trim extra spaces
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

