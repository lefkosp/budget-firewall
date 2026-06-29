import mongoose, { Schema, Document, Types } from "mongoose";

export enum ApprovalTargetType {
  TRANSACTION = "TRANSACTION",
  INTENT = "INTENT",
}

export enum ApprovalDecision {
  APPROVED = "APPROVED",
  DENIED = "DENIED",
}

export interface IApproval extends Document {
  ownerUserId: Types.ObjectId;
  actorUserId: Types.ObjectId;
  targetType: ApprovalTargetType;
  targetId: string;
  decision: ApprovalDecision;
  note?: string;
  createdAt: Date;
}

const ApprovalSchema = new Schema<IApproval>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: Object.values(ApprovalTargetType),
      required: true,
    },
    targetId: {
      type: String,
      required: true,
    },
    decision: {
      type: String,
      enum: Object.values(ApprovalDecision),
      required: true,
    },
    note: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Approval = mongoose.model<IApproval>("Approval", ApprovalSchema);

