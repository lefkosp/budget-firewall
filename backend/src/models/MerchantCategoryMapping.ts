import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * A user's manual "this merchant is always X" correction. Consulted by the
 * categorizer before the keyword table, so once a user fixes a merchant once
 * it stays fixed on every future import -- not just the transaction they
 * edited.
 */
export interface IMerchantCategoryMapping extends Document {
  ownerUserId: Types.ObjectId;
  merchantNameNormalized: string;
  category: string;
  createdAt: Date;
}

const MerchantCategoryMappingSchema = new Schema<IMerchantCategoryMapping>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    merchantNameNormalized: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// One mapping per (user, merchant) -- a newer correction replaces the old one.
MerchantCategoryMappingSchema.index(
  { ownerUserId: 1, merchantNameNormalized: 1 },
  { unique: true }
);

export const MerchantCategoryMapping = mongoose.model<IMerchantCategoryMapping>(
  "MerchantCategoryMapping",
  MerchantCategoryMappingSchema
);
