import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * "This isn't a subscription" -- subscriptions themselves are computed
 * on-demand from transaction history (detectSubscriptions is a pure
 * function, nothing to keep in sync), but a dismissal has to persist across
 * requests, so it's the one thing actually stored.
 */
export interface ISubscriptionDismissal extends Document {
  ownerUserId: Types.ObjectId;
  merchantNameNormalized: string;
  createdAt: Date;
}

const SubscriptionDismissalSchema = new Schema<ISubscriptionDismissal>(
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
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

SubscriptionDismissalSchema.index(
  { ownerUserId: 1, merchantNameNormalized: 1 },
  { unique: true }
);

export const SubscriptionDismissal = mongoose.model<ISubscriptionDismissal>(
  "SubscriptionDismissal",
  SubscriptionDismissalSchema
);
