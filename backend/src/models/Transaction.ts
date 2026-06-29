import mongoose, { Schema, Document, Types } from "mongoose";

export enum ApprovalStatus {
  NEUTRAL = "NEUTRAL",
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  DENIED = "DENIED",
  VIOLATION = "VIOLATION",
}

export interface ITransaction extends Document {
  ownerUserId: Types.ObjectId;
  accountId: Types.ObjectId;
  providerTransactionId: string;
  bookedAt: Date;
  amount: number; // in cents
  currency: string;
  rawDescription: string;
  merchantNameNormalized: string;
  providerCategory?: string;
  computedCategory: string;
  // Additional CSV fields
  transactionType?: string; // e.g., "CARD PAYMENT", "TRANSFER"
  product?: string; // e.g., "Current", "Savings"
  startedDate?: Date; // Transaction start date (if different from bookedAt)
  balance?: number; // Account balance after transaction (in cents)
  isGambling: boolean;
  isCrypto: boolean;
  isBlacklisted: boolean;
  isOverBudget: boolean;
  approvalRequired: boolean;
  approvalStatus: ApprovalStatus;
  matchedIntentId?: Types.ObjectId;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    providerTransactionId: {
      type: String,
      required: true,
      unique: true,
    },
    bookedAt: {
      type: Date,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
    },
    rawDescription: {
      type: String,
      required: true,
    },
    merchantNameNormalized: {
      type: String,
      required: true,
    },
    providerCategory: {
      type: String,
    },
    computedCategory: {
      type: String,
      default: "unknown",
    },
    transactionType: {
      type: String,
    },
    product: {
      type: String,
    },
    startedDate: {
      type: Date,
    },
    balance: {
      type: Number, // in cents
    },
    isGambling: {
      type: Boolean,
      default: false,
    },
    isCrypto: {
      type: Boolean,
      default: false,
    },
    isBlacklisted: {
      type: Boolean,
      default: false,
    },
    isOverBudget: {
      type: Boolean,
      default: false,
    },
    approvalRequired: {
      type: Boolean,
      default: false,
    },
    approvalStatus: {
      type: String,
      enum: Object.values(ApprovalStatus),
      default: ApprovalStatus.NEUTRAL,
    },
    matchedIntentId: {
      type: Schema.Types.ObjectId,
      ref: "Intent",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Transaction = mongoose.model<ITransaction>(
  "Transaction",
  TransactionSchema
);
