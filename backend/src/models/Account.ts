import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAccount extends Document {
  ownerUserId: Types.ObjectId;
  providerAccountId: string;
  name: string;
  currency: string;
  /** Wall-clock time of the last successful sync -- the cursor for the next sync's date_from window (see utils/syncWindow.ts). Unset means never synced. */
  lastSyncedAt?: Date;
  createdAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerAccountId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    currency: {
      type: String,
      required: true,
    },
    lastSyncedAt: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Account = mongoose.model<IAccount>("Account", AccountSchema);

