import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAccount extends Document {
  ownerUserId: Types.ObjectId;
  providerAccountId: string;
  name: string;
  currency: string;
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
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Account = mongoose.model<IAccount>("Account", AccountSchema);

