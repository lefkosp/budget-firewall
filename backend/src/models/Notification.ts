import mongoose, { Schema, Document, Types } from "mongoose";

export enum NotificationType {
  PENDING_APPROVAL = "PENDING_APPROVAL",
  NEW_INTENT = "NEW_INTENT",
  COLLABORATOR_DECISION = "COLLABORATOR_DECISION",
}

export interface INotification extends Document {
  recipientUserId: Types.ObjectId;
  ownerUserId: Types.ObjectId;
  type: NotificationType;
  message: string;
  readAt?: Date;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

NotificationSchema.index({ recipientUserId: 1, readAt: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>("Notification", NotificationSchema);
