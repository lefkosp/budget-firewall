import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { MerchantCategoryMapping } from "../models/MerchantCategoryMapping";
import { normalizeMerchant } from "../utils/normalizeMerchant";
import {
  Category,
  DEFAULT_CATEGORY,
  SpendingCategory,
} from "../constants/categories";

/**
 * Rule-based transaction categorizer.
 *
 * Deterministic and data-driven on purpose: it's a pure function over a
 * lookup table, so it's cheap, testable, and easy to extend by adding rows.
 * Where it can't decide, it returns "Other" rather than guessing -- the user
 * corrects it once and the merchant mapping remembers.
 *
 * Note gambling and crypto merchants get an ordinary category here. Those are
 * risk *flags* applied separately by the rules engine, so a bookmaker is
 * Entertainment that happens to be flagged, not a category unto itself.
 */

export interface CategorizeInput {
  merchantNameNormalized: string;
  rawDescription: string;
  amount: number; // cents; negative = money out
  transactionType?: string;
  /** Category supplied by the bank/CSV, used only as a weak hint. */
  providerCategory?: string;
}

/**
 * Merchant patterns per category. Matched against the normalized merchant
 * name, falling back to the raw description. Add rows freely -- keep them
 * specific enough not to catch unrelated merchants.
 */
const MERCHANT_PATTERNS: Array<{ category: SpendingCategory; patterns: RegExp[] }> = [
  {
    category: "Groceries",
    patterns: [
      /\btesco\b/, /\blidl\b/, /\baldi\b/, /\bsainsbury/, /\basda\b/,
      /\bwaitrose\b/, /\bmorrisons\b/, /\bspar\b/, /\bcarrefour\b/,
      /\bsupervalu\b/, /\bdunnes\b/, /\bcentra\b/, /\balbert heijn\b/,
      /\bmercadona\b/, /\bcoop\b/, /\bmigros\b/, /\brewe\b/, /\bedeka\b/,
      /\bsupermarket\b/, /\bgrocer/,
    ],
  },
  {
    category: "Eating Out",
    patterns: [
      /\bstarbucks\b/, /\bcosta\b/, /\bcaffe nero\b/, /\bpret\b/,
      /\bmcdonald/, /\bburger king\b/, /\bkfc\b/, /\bsubway\b/,
      /\bdomino/, /\bpizza hut\b/, /\bnando/, /\bwagamama\b/,
      /\bdeliveroo\b/, /\buber eats\b/, /\bjust eat\b/, /\bglovo\b/,
      /\bwolt\b/, /\bdoordash\b/, /\bgrubhub\b/,
      /\brestaurant\b/, /\bcafe\b/, /\bcoffee\b/, /\bbakery\b/, /\bbar\b/,
      /\bpub\b/, /\bbistro\b/, /\bkitchen\b/, /\bgrill\b/,
    ],
  },
  {
    category: "Transport",
    patterns: [
      /\buber\b/, /\bbolt\b/, /\blyft\b/, /\bfree now\b/, /\btaxi\b/,
      /\btfl\b/, /\bnational rail\b/, /\btrainline\b/, /\birish rail\b/,
      /\bdublin bus\b/, /\bleap card\b/, /\bmetro\b/, /\bparking\b/,
      /\bshell\b/, /\bbp\b/, /\besso\b/, /\btexaco\b/, /\bcircle k\b/,
      /\bpetrol\b/, /\bfuel\b/, /\btoll\b/,
    ],
  },
  {
    category: "Bills & Utilities",
    patterns: [
      /\bvodafone\b/, /\bthree\b/, /\bo2\b/, /\bee\b/, /\beir\b/,
      /\bvirgin media\b/, /\bsky\b/, /\bbt\b/,
      /\belectric ireland\b/, /\bbord gais\b/, /\bsse\b/, /\bairtricity\b/,
      /\bbritish gas\b/, /\bedf\b/, /\beon\b/,
      /\bwater\b/, /\binsurance\b/, /\bcouncil tax\b/, /\brent\b/,
      /\bmortgage\b/, /\bbroadband\b/,
    ],
  },
  {
    category: "Subscriptions",
    patterns: [
      /\bnetflix\b/, /\bspotify\b/, /\bdisney/, /\bhbo\b/, /\bhulu\b/,
      /\bprime video\b/, /\bapple\b/, /\bgoogle play\b/, /\byoutube\b/,
      /\bpatreon\b/, /\bsubstack\b/, /\bmedium\b/, /\baudible\b/,
      /\bicloud\b/, /\bdropbox\b/, /\bnotion\b/, /\bgithub\b/,
      /\badobe\b/, /\bmicrosoft 365\b/, /\bgym\b/, /\bmembership\b/,
      /\bsubscription\b/,
    ],
  },
  {
    category: "Shopping",
    patterns: [
      /\bamazon\b/, /\bebay\b/, /\betsy\b/, /\basos\b/, /\bzara\b/,
      /\bh&m\b/, /\bprimark\b/, /\buniqlo\b/, /\bnike\b/, /\badidas\b/,
      /\bikea\b/, /\bargos\b/, /\bcurrys\b/, /\bharvey norman\b/,
      /\bdecathlon\b/, /\baliexpress\b/, /\bshein\b/, /\btemu\b/,
      /\bbinance\b/, /\bcoinbase\b/, /\bkraken\b/, /\bcrypto\b/,
      /\bstore\b/, /\bshop\b/, /\bretail\b/,
    ],
  },
  {
    category: "Entertainment",
    patterns: [
      /\bcinema\b/, /\bodeon\b/, /\bvue\b/, /\bcineworld\b/,
      /\bticketmaster\b/, /\beventbrite\b/, /\btheatre\b/, /\bconcert\b/,
      /\bsteam\b/, /\bplaystation\b/, /\bxbox\b/, /\bnintendo\b/,
      /\bepic games\b/, /\btwitch\b/,
      /\bbet365\b/, /\bpaddy power\b/, /\bbetfair\b/, /\bwilliam hill\b/,
      /\bstake\b/, /\bpokerstars\b/, /\bcasino\b/, /\bbetting\b/,
    ],
  },
  {
    category: "Health",
    patterns: [
      /\bboots\b/, /\bpharmacy\b/, /\bchemist\b/, /\bhospital\b/,
      /\bclinic\b/, /\bdentist\b/, /\bdoctor\b/, /\bmedical\b/,
      /\boptician\b/, /\bspecsavers\b/, /\bphysio\b/,
    ],
  },
  {
    category: "Travel",
    patterns: [
      /\bryanair\b/, /\baer lingus\b/, /\beasyjet\b/, /\bbritish airways\b/,
      /\blufthansa\b/, /\bklm\b/, /\bwizz air\b/, /\bairline\b/, /\bairways\b/,
      /\bbooking\.com\b/, /\bairbnb\b/, /\bhotel\b/, /\bhostel\b/,
      /\bexpedia\b/, /\btrivago\b/, /\bhertz\b/, /\bavis\b/, /\beurope?car\b/,
      /\bairport\b/, /\bferry\b/,
    ],
  },
];

/** Non-spend detection. Checked before merchant matching -- these win. */
const TRANSFER_PATTERNS = [
  /\btop[\s-]?up\b/, /\btransfer\b/, /\bsent from\b/, /\bto savings\b/,
  /\bvault\b/, /\bpocket\b/, /\bexchange(d)?\b/, /\bmoved\b/,
  /\bwithdraw(al)?\b(?!.*\bfee\b)/,
];

const FEE_PATTERNS = [
  /\bfee\b/, /\bcharge[sd]?\b/, /\bcommission\b/, /\binterest\b/,
  /\boverdraft\b/,
];

const INCOME_PATTERNS = [
  /\bsalary\b/, /\bpayroll\b/, /\bwages\b/, /\brefund\b/, /\breimburse/,
  /\bdividend\b/, /\bcashback\b/, /\bpayment from\b/, /\breceived from\b/,
];

function matchesAny(haystack: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(haystack));
}

/** Length of the substring a pattern actually matched, or 0 if it didn't match at all. */
function matchLength(haystack: string, pattern: RegExp): number {
  return haystack.match(pattern)?.[0].length ?? 0;
}

/**
 * Picks the category whose pattern matched the longest substring of the
 * haystack -- "most specific wins," not "first in the list wins." Category
 * order in MERCHANT_PATTERNS is otherwise arbitrary, and several categories
 * carry deliberately broad catch-all keywords (Shopping's `store`/`shop`,
 * Eating Out's `bar`/`cafe`) to catch the long tail of merchants that don't
 * match a named brand. Without this, a merchant like "Boots Pharmacy Store"
 * would land in Shopping (checked before Health) purely because Shopping
 * happens to come first, even though "pharmacy" is the far more specific
 * signal. This mirrors how keyword-based categorizers are built elsewhere
 * (e.g. PocketSmith's category rules: "the category whose matched keyword
 * is longest is assigned").
 */
function bestMerchantCategoryMatch(haystack: string): SpendingCategory | null {
  let bestCategory: SpendingCategory | null = null;
  let bestLength = 0;

  for (const { category, patterns } of MERCHANT_PATTERNS) {
    for (const pattern of patterns) {
      const length = matchLength(haystack, pattern);
      if (length > bestLength) {
        bestLength = length;
        bestCategory = category;
      }
    }
  }

  return bestCategory;
}

/**
 * Returns the category for a transaction. Never returns "unknown" -- the
 * worst case is "Other", which is a real, budgetable category.
 */
/**
 * merchantMap: a user's manual "this merchant is always X" corrections
 * (normalized merchant name -> category), loaded once by the caller and
 * passed in rather than queried per-call so this stays a pure, fast
 * function. Checked first -- a manual correction outranks every pattern
 * below, including fee/transfer/income detection.
 */
export function categorizeTransaction(
  input: CategorizeInput,
  merchantMap?: Map<string, string>
): Category {
  const merchant = (input.merchantNameNormalized || "").toLowerCase();
  const raw = (input.rawDescription || "").toLowerCase();
  const type = (input.transactionType || "").toLowerCase();
  const haystack = `${merchant} ${raw}`.trim();

  const mapped = merchantMap?.get(merchant);
  if (mapped) {
    return mapped as Category;
  }

  // Fees before transfers: "ATM withdrawal fee" is a fee, not a withdrawal.
  if (matchesAny(haystack, FEE_PATTERNS)) {
    return "Fees";
  }

  // Transfers move money between your own accounts -- never spending, in
  // either direction, so this is checked before the income sign heuristic.
  if (type === "transfer" || matchesAny(haystack, TRANSFER_PATTERNS)) {
    return "Transfers";
  }

  if (matchesAny(haystack, INCOME_PATTERNS)) {
    return "Income";
  }

  // Anything else crediting the account is income.
  if (input.amount > 0) {
    return "Income";
  }

  const bestMatch = bestMerchantCategoryMatch(haystack);
  if (bestMatch) {
    return bestMatch;
  }

  return DEFAULT_CATEGORY;
}

/**
 * Loads a user's manual merchant->category corrections as a lookup map.
 * Load once per import/recategorize batch and pass to categorizeTransaction
 * -- this is the only place that touches the database for it.
 */
export async function loadMerchantCategoryMap(
  userId: string
): Promise<Map<string, string>> {
  const mappings = await MerchantCategoryMapping.find({
    ownerUserId: new Types.ObjectId(userId),
  }).select("merchantNameNormalized category");

  return new Map(mappings.map((m) => [m.merchantNameNormalized, m.category]));
}

export interface RecategorizeResult {
  examined: number;
  updated: number;
  skippedOverridden: number;
}

/**
 * Re-runs normalization and categorization over a user's existing
 * transactions.
 *
 * Needed whenever the merchant table or the normalizer improves, and to
 * migrate history imported before the categorizer existed (which all landed
 * as "unknown"). Re-normalizing matters as much as re-categorizing: the
 * categorizer matches on the normalized name, so stale names would keep
 * producing stale categories.
 *
 * Manual overrides are left alone -- a user correction outranks the table.
 */
export async function recategorizeUserTransactions(
  userId: string
): Promise<RecategorizeResult> {
  const [transactions, merchantMap] = await Promise.all([
    Transaction.find({ ownerUserId: new Types.ObjectId(userId) }).select(
      "merchantNameNormalized rawDescription amount transactionType providerCategory computedCategory categoryOverridden"
    ),
    loadMerchantCategoryMap(userId),
  ]);

  let updated = 0;
  let skippedOverridden = 0;

  for (const tx of transactions) {
    if (tx.categoryOverridden) {
      skippedOverridden++;
      continue;
    }

    const merchantNameNormalized = normalizeMerchant(tx.rawDescription);
    const category = categorizeTransaction(
      {
        merchantNameNormalized,
        rawDescription: tx.rawDescription,
        amount: tx.amount,
        transactionType: tx.transactionType,
        providerCategory: tx.providerCategory,
      },
      merchantMap
    );

    if (
      category !== tx.computedCategory ||
      merchantNameNormalized !== tx.merchantNameNormalized
    ) {
      await Transaction.findByIdAndUpdate(tx._id, {
        computedCategory: category,
        merchantNameNormalized,
      });
      updated++;
    }
  }

  return { examined: transactions.length, updated, skippedOverridden };
}
