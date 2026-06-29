import mongoose, { Schema, Document, Types } from "mongoose";

export enum IntentStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  DENIED = "DENIED",
}

export interface IIntent extends Document {
  ownerUserId: Types.ObjectId;
  amount: number; // in cents
  merchantText: string;
  category: string;
  note?: string;
  expiresAt: Date;
  status: IntentStatus;
  createdAt: Date;
}

const IntentSchema = new Schema<IIntent>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    merchantText: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    note: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(IntentStatus),
      default: IntentStatus.PENDING,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Intent = mongoose.model<IIntent>("Intent", IntentSchema);

