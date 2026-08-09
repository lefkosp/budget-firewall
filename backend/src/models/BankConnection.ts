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
  /** Our own reference, generated at requisition creation -- the app's lookup key, echoed back by GoCardless's redirect as `?ref=`. */
  requisitionId: string;
  /** The provider's own identifier for this requisition/consent, needed for every subsequent call to their API. Absent for the mock provider path until linked. */
  providerRequisitionId?: string;
  status: BankConnectionStatus;
  /** When the bank consent expires (GoCardless consents run ~90 days) -- set once the connection is actually linked. */
  consentExpiresAt?: Date;
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
    providerRequisitionId: {
      type: String,
    },
    status: {
      type: String,
      enum: Object.values(BankConnectionStatus),
      default: BankConnectionStatus.CREATED,
    },
    consentExpiresAt: {
      type: Date,
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
