import { Types } from "mongoose";
import { Notification, NotificationType } from "../models/Notification";
import { Collaborator } from "../models/Collaborator";
import { User } from "../models/User";

/** New pending/violation transactions landed on an owner's account -- notifies only canApprove collaborators, since view-only ones can't act on them. */
export async function notifyPendingApprovals(ownerUserId: string, count: number): Promise<void> {
  if (count === 0) return;

  const collaborators = await Collaborator.find({
    ownerUserId: new Types.ObjectId(ownerUserId),
    canApprove: true,
    revokedAt: { $exists: false },
  });
  if (collaborators.length === 0) return;

  const message = count === 1 ? "1 new transaction needs approval" : `${count} new transactions need approval`;

  await Notification.insertMany(
    collaborators.map((c) => ({
      recipientUserId: c.collaboratorUserId,
      ownerUserId: new Types.ObjectId(ownerUserId),
      type: NotificationType.PENDING_APPROVAL,
      message,
    }))
  );
}

/** A new spending intent was created -- informational, so every active collaborator gets it, view-only included. */
export async function notifyNewIntent(ownerUserId: string, merchantText: string): Promise<void> {
  const collaborators = await Collaborator.find({
    ownerUserId: new Types.ObjectId(ownerUserId),
    revokedAt: { $exists: false },
  });
  if (collaborators.length === 0) return;

  const message = `New spending intent: ${merchantText}`;

  await Notification.insertMany(
    collaborators.map((c) => ({
      recipientUserId: c.collaboratorUserId,
      ownerUserId: new Types.ObjectId(ownerUserId),
      type: NotificationType.NEW_INTENT,
      message,
    }))
  );
}

/** A collaborator approved/denied on the owner's behalf -- tells the owner, the one direction of the loop that's genuinely new information for them. */
export async function notifyCollaboratorDecision(
  ownerUserId: string,
  actorUserId: string,
  decision: "approved" | "denied",
  merchantNameNormalized: string
): Promise<void> {
  if (ownerUserId === actorUserId) return;

  const actor = await User.findById(actorUserId);
  const actorLabel = actor?.name || actor?.email || "A collaborator";

  await Notification.create({
    recipientUserId: new Types.ObjectId(ownerUserId),
    ownerUserId: new Types.ObjectId(ownerUserId),
    type: NotificationType.COLLABORATOR_DECISION,
    message: `${actorLabel} ${decision} your transaction at ${merchantNameNormalized}`,
  });
}
