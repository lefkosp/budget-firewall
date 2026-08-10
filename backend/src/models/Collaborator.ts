import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICollaborator extends Document {
  ownerUserId: Types.ObjectId;
  collaboratorUserId: Types.ObjectId;
  /** Whether this collaborator can approve/deny the owner's transactions -- the core "accountability buddy" action. Viewing is always allowed for an active relationship. */
  canApprove: boolean;
  /** Absence means active. Soft-revoked rather than deleted so revoked history stays visible and re-inviting the same person reactivates this row instead of racing a fresh insert. */
  revokedAt?: Date;
  createdAt: Date;
}

const CollaboratorSchema = new Schema<ICollaborator>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    collaboratorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    canApprove: {
      type: Boolean,
      default: true,
    },
    revokedAt: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

CollaboratorSchema.index({ ownerUserId: 1, collaboratorUserId: 1 }, { unique: true });

export const Collaborator = mongoose.model<ICollaborator>(
  "Collaborator",
  CollaboratorSchema
);
