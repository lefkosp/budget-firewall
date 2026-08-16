import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Links a P2P inflow ("Transfer from Family Member A") to one of the user's
 * own spend transactions it pays back -- e.g. money fronted for a friend
 * that they then repaid. Many-to-many by design: one inflow can settle
 * several small expenses at once, and one expense can be repaid by more than
 * one person. `linkedAmount` is the portion actually netted, which may be
 * less than either transaction's full amount (a partial reimbursement).
 *
 * Both totalSpend (routes/stats.ts) and calculateCategoryStats
 * (analytics.service.ts) subtract linkedAmount from the expense side to
 * produce "Net Spend" -- see reimbursement.service.ts for the
 * remaining-balance bookkeeping that keeps a transaction from being
 * over-linked past its own amount.
 */
export interface IReimbursementLink extends Document {
  ownerUserId: Types.ObjectId;
  expenseTransactionId: Types.ObjectId;
  reimbursementTransactionId: Types.ObjectId;
  linkedAmount: number; // cents, always positive
  createdAt: Date;
}

const ReimbursementLinkSchema = new Schema<IReimbursementLink>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    expenseTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      index: true,
    },
    reimbursementTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      index: true,
    },
    linkedAmount: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const ReimbursementLink = mongoose.model<IReimbursementLink>(
  "ReimbursementLink",
  ReimbursementLinkSchema
);
