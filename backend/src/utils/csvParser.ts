import { parse } from "csv-parse/sync";

export interface ParsedTransaction {
  providerTransactionId: string;
  bookedAt: Date;
  amount: number; // in cents
  currency: string;
  rawDescription: string;
  providerCategory?: string;
  transactionType?: string; // e.g., "CARD PAYMENT", "TRANSFER"
  product?: string; // e.g., "Current", "Savings"
  startedDate?: Date; // Transaction start date (if different from bookedAt)
  balance?: number; // Account balance after transaction (in cents)
}

/**
 * Builds a deterministic, idempotent transaction ID from the fields a CSV
 * row actually has (no bank export we support carries its own transaction
 * ID). Two genuinely separate transactions can share every one of those
 * fields -- two identical coffees at the same shop on the same day, same
 * amount -- so a bare content hash would collide and the second row would
 * be silently dropped as a "duplicate" of the first.
 *
 * `occurrenceCounts` disambiguates by row order within one parse: the Nth
 * row matching a given (account, date, amount, description) combination
 * gets occurrence index N. Re-importing the exact same file reproduces the
 * same row order and therefore the same IDs, so already-imported rows are
 * still correctly recognized as duplicates -- only genuinely repeated
 * transactions within a single import get distinct IDs now. (This doesn't
 * fully solve re-imports whose row order differs from the original file,
 * e.g. two overlapping exports sorted differently -- there's no way to do
 * better than that without the source data providing a real transaction ID.)
 */
function buildTransactionId(
  occurrenceCounts: Map<string, number>,
  accountId: string,
  bookedAt: Date,
  amount: number,
  description: string
): string {
  const baseKey = `${accountId}_${bookedAt.getTime()}_${Math.abs(amount)}_${description
    .substring(0, 20)
    .replace(/\s/g, "_")}`;
  const occurrence = occurrenceCounts.get(baseKey) ?? 0;
  occurrenceCounts.set(baseKey, occurrence + 1);
  return `csv_${baseKey}_${occurrence}`;
}

/**
 * Detects CSV format and parses transactions
 * Supports:
 * - Revolut format (Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance)
 *   Note: "Type" is transaction type (e.g., "CARD PAYMENT"), not category. Categories are determined from merchant names.
 * - Generic bank statement format (Date, Description, Amount, etc.)
 */
export function parseCSVTransactions(
  csvContent: string,
  accountId: string
): ParsedTransaction[] {
  try {
    console.log(`[CSV Parser] Starting parse for account ${accountId}`);
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`[CSV Parser] Parsed ${records.length} raw rows from CSV`);

    if (records.length === 0) {
      throw new Error("CSV file is empty or has no valid rows");
    }

    // Detect format by checking column names
    const firstRow = records[0];
    const columns = Object.keys(firstRow);
    console.log(`[CSV Parser] Detected columns: ${columns.join(", ")}`);

    // Revolut format detection
    if (
      columns.some((col) => col.toLowerCase().includes("completed date")) &&
      columns.some((col) => col.toLowerCase().includes("description")) &&
      columns.some((col) => col.toLowerCase().includes("amount"))
    ) {
      console.log(`[CSV Parser] Detected format: Revolut`);
      return parseRevolutFormat(records, accountId);
    }

    // Generic format detection (Date, Description, Amount)
    if (
      columns.some((col) => col.toLowerCase().includes("date")) &&
      columns.some((col) => col.toLowerCase().includes("description")) &&
      columns.some((col) => col.toLowerCase().includes("amount"))
    ) {
      console.log(`[CSV Parser] Detected format: Generic bank statement`);
      return parseGenericFormat(records, accountId);
    }

    console.error(
      `[CSV Parser] Unsupported format. Columns found: ${columns.join(", ")}`
    );
    throw new Error(
      "Unsupported CSV format. Expected columns: Date, Description, Amount (or similar)"
    );
  } catch (error: any) {
    if (error.message) {
      console.error(`[CSV Parser] Parse error: ${error.message}`);
      throw error;
    }
    console.error(`[CSV Parser] Unknown parse error:`, error);
    throw new Error("Failed to parse CSV file. Please check the format.");
  }
}

function parseRevolutFormat(
  records: any[],
  accountId: string
): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  let skippedCount = 0;
  let skippedReasons: Record<string, number> = {};
  const occurrenceCounts = new Map<string, number>();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      // Find columns (case-insensitive) - Revolut format:
      // Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance
      // Note: Product column (e.g., "Current", "Savings") is available but not currently used
      const dateKey =
        Object.keys(record).find(
          (key) =>
            key.toLowerCase() === "completed date" ||
            key.toLowerCase().includes("completed date")
        ) ||
        Object.keys(record).find((key) => key.toLowerCase().includes("date"));
      const descriptionKey = Object.keys(record).find(
        (key) => key.toLowerCase() === "description"
      );
      const amountKey = Object.keys(record).find(
        (key) => key.toLowerCase() === "amount"
      );
      const currencyKey = Object.keys(record).find(
        (key) => key.toLowerCase() === "currency"
      );
      const feeKey = Object.keys(record).find(
        (key) => key.toLowerCase() === "fee"
      );
      const stateKey = Object.keys(record).find(
        (key) => key.toLowerCase() === "state"
      );
      const typeKey = Object.keys(record).find(
        (key) => key.toLowerCase() === "type"
      );
      const productKey = Object.keys(record).find(
        (key) => key.toLowerCase() === "product"
      );
      const startedDateKey = Object.keys(record).find(
        (key) =>
          key.toLowerCase() === "started date" ||
          key.toLowerCase().includes("started date")
      );
      const balanceKey = Object.keys(record).find(
        (key) => key.toLowerCase() === "balance"
      );
      // Note: "Type" is transaction type (e.g., "CARD PAYMENT", "TRANSFER"), not category
      // Category should be determined from merchant name/description, not from CSV columns
      const categoryKey = Object.keys(record).find((key) =>
        key.toLowerCase().includes("category")
      );

      if (!dateKey || !descriptionKey || !amountKey) {
        skippedCount++;
        skippedReasons["missing_columns"] =
          (skippedReasons["missing_columns"] || 0) + 1;
        continue; // Skip invalid rows
      }

      // Filter by State if available - only import completed transactions
      if (stateKey) {
        const state = (record[stateKey] || "").toLowerCase().trim();
        if (state && state !== "completed" && state !== "settled") {
          skippedCount++;
          skippedReasons["pending_state"] =
            (skippedReasons["pending_state"] || 0) + 1;
          continue; // Skip pending/failed transactions
        }
      }

      const dateStr = record[dateKey];
      const description = record[descriptionKey] || "";
      const amountStr = record[amountKey];
      const currency = currencyKey ? record[currencyKey] || "EUR" : "EUR";
      const feeStr = feeKey ? record[feeKey] : null;
      const transactionType = typeKey ? record[typeKey] : undefined;
      const product = productKey ? record[productKey] : undefined;
      const startedDateStr = startedDateKey ? record[startedDateKey] : null;
      const balanceStr = balanceKey ? record[balanceKey] : null;

      // Parse date (handle various formats)
      const bookedAt = parseDate(dateStr);
      if (!bookedAt) {
        skippedCount++;
        skippedReasons["invalid_date"] =
          (skippedReasons["invalid_date"] || 0) + 1;
        continue; // Skip rows with invalid dates
      }

      // Parse amount (handle various formats: "25.50", "-25.50", "€25.50", etc.)
      let amount = parseAmount(amountStr);
      if (amount === null) {
        skippedCount++;
        skippedReasons["invalid_amount"] =
          (skippedReasons["invalid_amount"] || 0) + 1;
        continue; // Skip rows with invalid amounts
      }

      // Add fee to amount if present (fees are typically negative adjustments)
      if (feeStr) {
        const fee = parseAmount(feeStr);
        if (fee !== null) {
          amount += fee; // Fee is already in cents, add it to the amount
        }
      }

      // Parse started date if available
      let startedDate: Date | undefined = undefined;
      if (startedDateStr) {
        const parsedStartedDate = parseDate(startedDateStr);
        if (parsedStartedDate) {
          startedDate = parsedStartedDate;
        }
      }

      // Parse balance if available
      let balance: number | undefined = undefined;
      if (balanceStr) {
        const parsedBalance = parseAmount(balanceStr);
        if (parsedBalance !== null) {
          balance = parsedBalance; // Already in cents
        }
      }

      const providerTransactionId = buildTransactionId(
        occurrenceCounts,
        accountId,
        bookedAt,
        amount,
        description
      );

      transactions.push({
        providerTransactionId,
        bookedAt,
        amount, // Already in cents (including fee if applicable)
        currency: currency.toUpperCase(),
        rawDescription: description,
        providerCategory: categoryKey ? record[categoryKey] : undefined,
        transactionType,
        product,
        startedDate,
        balance,
      });
    } catch (error: any) {
      skippedCount++;
      skippedReasons["parse_error"] = (skippedReasons["parse_error"] || 0) + 1;
      console.warn(`[CSV Parser] Error parsing row ${i + 1}:`, error.message);
      continue;
    }
  }

  console.log(
    `[CSV Parser] Revolut format: Parsed ${transactions.length} valid transactions, skipped ${skippedCount} rows`
  );
  if (skippedCount > 0) {
    console.log(`[CSV Parser] Skip reasons:`, skippedReasons);
  }

  return transactions;
}

function parseGenericFormat(
  records: any[],
  accountId: string
): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  let skippedCount = 0;
  let skippedReasons: Record<string, number> = {};
  const occurrenceCounts = new Map<string, number>();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      // Find columns (case-insensitive)
      const dateKey = Object.keys(record).find((key) =>
        key.toLowerCase().includes("date")
      );
      const descriptionKey = Object.keys(record).find(
        (key) =>
          key.toLowerCase().includes("description") ||
          key.toLowerCase().includes("merchant") ||
          key.toLowerCase().includes("payee")
      );
      const amountKey = Object.keys(record).find(
        (key) =>
          key.toLowerCase().includes("amount") ||
          key.toLowerCase().includes("value")
      );
      const currencyKey = Object.keys(record).find((key) =>
        key.toLowerCase().includes("currency")
      );

      if (!dateKey || !descriptionKey || !amountKey) {
        skippedCount++;
        skippedReasons["missing_columns"] =
          (skippedReasons["missing_columns"] || 0) + 1;
        continue;
      }

      const dateStr = record[dateKey];
      const description = record[descriptionKey] || "";
      const amountStr = record[amountKey];
      const currency = currencyKey ? record[currencyKey] || "EUR" : "EUR";

      const bookedAt = parseDate(dateStr);
      if (!bookedAt) {
        skippedCount++;
        skippedReasons["invalid_date"] =
          (skippedReasons["invalid_date"] || 0) + 1;
        continue;
      }

      const amount = parseAmount(amountStr);
      if (amount === null) {
        skippedCount++;
        skippedReasons["invalid_amount"] =
          (skippedReasons["invalid_amount"] || 0) + 1;
        continue;
      }

      const providerTransactionId = buildTransactionId(
        occurrenceCounts,
        accountId,
        bookedAt,
        amount,
        description
      );

      transactions.push({
        providerTransactionId,
        bookedAt,
        amount,
        currency: currency.toUpperCase(),
        rawDescription: description,
        providerCategory: undefined,
      });
    } catch (error: any) {
      skippedCount++;
      skippedReasons["parse_error"] = (skippedReasons["parse_error"] || 0) + 1;
      console.warn(`[CSV Parser] Error parsing row ${i + 1}:`, error.message);
      continue;
    }
  }

  console.log(
    `[CSV Parser] Generic format: Parsed ${transactions.length} valid transactions, skipped ${skippedCount} rows`
  );
  if (skippedCount > 0) {
    console.log(`[CSV Parser] Skip reasons:`, skippedReasons);
  }

  return transactions;
}

/**
 * Parses a date string from a bank export. Deliberately does NOT try the
 * native `Date` constructor as a first pass for anything but ISO: for a
 * slash- or dash-separated date it assumes US MM/DD/YYYY, which silently
 * misparses day-first exports (Revolut, and most EU banks, use DD/MM/YYYY)
 * for any day-of-month <= 12 -- "05/03/2025" (5 March) was becoming "3 May"
 * with no error, no warning, just a transaction landing in the wrong month.
 *
 * Every branch below anchors to UTC midnight rather than local time, so the
 * resulting calendar day doesn't drift depending on the server's timezone.
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();

  // ISO 8601 (YYYY-MM-DD, optionally with a time suffix) is unambiguous.
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, year, month, day] = iso;
    return toUTCDate(year, month, day);
  }

  // YYYY/MM/DD -- also unambiguous, the year always leads.
  const ymd = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (ymd) {
    const [, year, month, day] = ymd;
    return toUTCDate(year, month, day);
  }

  // DD/MM/YYYY or DD-MM-YYYY -- always day-first, never falling back to a
  // month-first interpretation regardless of whether the day is <= 12.
  const dmy = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return toUTCDate(year, month, day);
  }

  return null;
}

function toUTCDate(year: string, month: string, day: string): Date | null {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const date = new Date(Date.UTC(y, m - 1, d));
  return isNaN(date.getTime()) ? null : date;
}

function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;

  // Remove currency symbols and whitespace
  let cleaned = amountStr
    .replace(/[€$£¥,]/g, "")
    .replace(/\s/g, "")
    .trim();

  // Handle negative amounts (parentheses, minus sign, etc.)
  const isNegative = cleaned.startsWith("-") || cleaned.startsWith("(");
  cleaned = cleaned.replace(/[()]/g, "").replace(/^-/, "");

  const amount = parseFloat(cleaned);
  if (isNaN(amount)) {
    return null;
  }

  // Convert to cents (multiply by 100)
  const cents = Math.round(amount * 100);
  return isNegative ? -cents : cents;
}
