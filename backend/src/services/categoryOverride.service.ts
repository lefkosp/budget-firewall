import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { MerchantCategoryMapping } from "../models/MerchantCategoryMapping";
import { Category } from "../constants/categories";

export interface SetCategoryResult {
  transaction: {
    id: string;
    computedCategory: string;
    categoryOverridden: boolean;
  };
  /** Other transactions from the same merchant also updated, if requested. */
  appliedToCount: number;
}

/**
 * Sets a transaction's category by hand. Always marks it overridden so
 * recategorize leaves it alone -- a user correction outranks the table.
 *
 * With applyToAllFromMerchant, also upserts a MerchantCategoryMapping (so
 * every future import from this merchant gets it right automatically) and
 * batch-updates the user's other existing transactions from the same
 * merchant, so the fix isn't limited to the one row the user happened to
 * click on.
 */
export async function setTransactionCategory(
  userId: string,
  transactionId: string,
  category: Category,
  applyToAllFromMerchant: boolean
): Promise<SetCategoryResult | null> {
  const ownerUserId = new Types.ObjectId(userId);

  const transaction = await Transaction.findOne({
    _id: transactionId,
    ownerUserId,
  });

  if (!transaction) {
    return null;
  }

  transaction.computedCategory = category;
  transaction.categoryOverridden = true;
  await transaction.save();

  let appliedToCount = 0;

  if (applyToAllFromMerchant && transaction.merchantNameNormalized) {
    await MerchantCategoryMapping.findOneAndUpdate(
      { ownerUserId, merchantNameNormalized: transaction.merchantNameNormalized },
      { category },
      { upsert: true }
    );

    const result = await Transaction.updateMany(
      {
        ownerUserId,
        merchantNameNormalized: transaction.merchantNameNormalized,
        _id: { $ne: transaction._id },
      },
      { computedCategory: category, categoryOverridden: true }
    );
    appliedToCount = result.modifiedCount;
  }

  return {
    transaction: {
      id: transaction._id.toString(),
      computedCategory: transaction.computedCategory,
      categoryOverridden: transaction.categoryOverridden,
    },
    appliedToCount,
  };
}
