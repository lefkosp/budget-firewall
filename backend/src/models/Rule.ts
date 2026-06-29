import mongoose, { Schema, Document, Types } from "mongoose";

export enum RuleType {
  MERCHANT_BLACKLIST = "MERCHANT_BLACKLIST",
  GAMBLING = "GAMBLING",
  CRYPTO = "CRYPTO",
  APPROVAL_THRESHOLD = "APPROVAL_THRESHOLD",
}

export interface IRule extends Document {
  ownerUserId: Types.ObjectId;
  type: RuleType;
  config: Record<string, any>;
  enabled: boolean;
  createdAt: Date;
}

const RuleSchema = new Schema<IRule>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(RuleType),
      required: true,
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Rule = mongoose.model<IRule>("Rule", RuleSchema);

