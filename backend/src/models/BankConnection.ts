import mongoose, { Schema, Document, Types } from "mongoose";

export enum BankConnectionStatus {
  CREATED = "CREATED",
  LINKED = "LINKED",
  EXPIRED = "EXPIRED",
  REVOKED = "REVOKED",
}

export interface IBankConnection extends Document {
  ownerUserId: Types.ObjectId;
  provider: string;
  requisitionId: string;
  status: BankConnectionStatus;
  createdAt: Date;
}

const BankConnectionSchema = new Schema<IBankConnection>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      default: "gocardless",
    },
    requisitionId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: Object.values(BankConnectionStatus),
      default: BankConnectionStatus.CREATED,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const BankConnection = mongoose.model<IBankConnection>(
  "BankConnection",
  BankConnectionSchema
);

