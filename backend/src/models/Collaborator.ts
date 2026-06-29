import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICollaborator extends Document {
  ownerUserId: Types.ObjectId;
  collaboratorUserId: Types.ObjectId;
  role: string;
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
    role: {
      type: String,
      default: "collaborator",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Collaborator = mongoose.model<ICollaborator>(
  "Collaborator",
  CollaboratorSchema
);

