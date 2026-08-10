import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICollaboratorInvite extends Document {
  ownerUserId: Types.ObjectId;
  /** Lowercased invitee email -- no account is required to exist yet; accepting either links an existing account or is completed as part of registering. */
  email: string;
  canApprove: boolean;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
}

const CollaboratorInviteSchema = new Schema<ICollaboratorInvite>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    canApprove: {
      type: Boolean,
      default: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // Mongo TTL index -- expired, unaccepted invites are auto-purged.
      expires: 0,
    },
    acceptedAt: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const CollaboratorInvite = mongoose.model<ICollaboratorInvite>(
  "CollaboratorInvite",
  CollaboratorInviteSchema
);
