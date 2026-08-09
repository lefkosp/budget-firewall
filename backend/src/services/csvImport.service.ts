import { Types } from "mongoose";
import { Account } from "../models/Account";
import { parseCSVTransactions, ParsedTransaction } from "../utils/csvParser";
import { syncAndProcessTransactions } from "./transaction.service";
import { ensureUserDefaults } from "./user.service";

export interface CSVImportResult {
  imported: number;
  new: number;
  skipped: number;
  errors: string[];
  /**
   * Rows in a currency other than EUR. They're imported and stored (nothing
   * is silently dropped), but excluded from every spend total, budget,
   * subscription, and analytics aggregation -- see the EUR-only v1 guard in
   * DEVELOPMENT_PLAN.md 6.5.3. Surfaced here so the import summary can warn
   * about it instead of totals just quietly not adding up later.
   */
  nonEurCount: number;
}

/**
 * Imports transactions from CSV content
 */
export async function importTransactionsFromCSV(
  userId: string,
  csvContent: string,
  accountName?: string,
  currency: string = "EUR"
): Promise<CSVImportResult> {
  console.log(`[CSV Import Service] Starting import for user ${userId}`);
  
  // Ensure user has default rules and budgets
  console.log(`[CSV Import Service] Ensuring user defaults for ${userId}`);
  await ensureUserDefaults(userId);

  // Get or create a default account for CSV imports
  const accountNameToUse = accountName || "CSV Import Account";
  console.log(`[CSV Import Service] Looking for account: "${accountNameToUse}"`);
  
  let account = await Account.findOne({
    ownerUserId: new Types.ObjectId(userId),
    name: accountNameToUse,
  });

  if (!account) {
    // Create a new account for CSV imports
    console.log(`[CSV Import Service] Creating new account: "${accountNameToUse}" with currency ${currency}`);
    account = await Account.create({
      ownerUserId: new Types.ObjectId(userId),
      providerAccountId: `csv_account_${userId}_${Date.now()}`,
      name: accountNameToUse,
      currency,
    });
    console.log(`[CSV Import Service] Account created with ID: ${account._id}`);
  } else {
    console.log(`[CSV Import Service] Using existing account: ${account._id} (${account.name})`);
  }

  // Parse CSV
  console.log(`[CSV Import Service] Parsing CSV content (${csvContent.length} chars)`);
  let parsedTransactions: ParsedTransaction[];
  try {
    parsedTransactions = parseCSVTransactions(csvContent, account._id.toString());
    console.log(`[CSV Import Service] Successfully parsed ${parsedTransactions.length} transactions from CSV`);
  } catch (error: any) {
    console.error(`[CSV Import Service] CSV parsing failed:`, error.message);
    throw new Error(`CSV parsing failed: ${error.message}`);
  }

  if (parsedTransactions.length === 0) {
    console.log(`[CSV Import Service] No valid transactions found in CSV`);
    throw new Error("No valid transactions found in CSV file");
  }

  // Import and process transactions
  console.log(`[CSV Import Service] Syncing and processing ${parsedTransactions.length} transactions`);
  const newTransactions = await syncAndProcessTransactions(
    userId,
    account._id.toString(),
    parsedTransactions
  );

  const skipped = parsedTransactions.length - newTransactions.length;
  const nonEurCount = parsedTransactions.filter((t) => t.currency !== "EUR").length;
  console.log(`[CSV Import Service] Import complete - New: ${newTransactions.length}, Skipped (duplicates): ${skipped}, Non-EUR: ${nonEurCount}`);

  return {
    imported: parsedTransactions.length,
    new: newTransactions.length,
    skipped,
    errors: [],
    nonEurCount,
  };
}






