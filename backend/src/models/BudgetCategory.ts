import mongoose, { Schema, Document, Types } from "mongoose";

export interface IBudgetCategory extends Document {
  ownerUserId: Types.ObjectId;
  name: string;
  monthlyLimit: number; // in cents
  createdAt: Date;
}

const BudgetCategorySchema = new Schema<IBudgetCategory>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    monthlyLimit: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const BudgetCategory = mongoose.model<IBudgetCategory>(
  "BudgetCategory",
  BudgetCategorySchema
);

