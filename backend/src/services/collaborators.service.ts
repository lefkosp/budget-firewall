import { Types } from "mongoose";
import { config } from "../config/env";
import { User } from "../models/User";
import { Collaborator } from "../models/Collaborator";
import { CollaboratorInvite } from "../models/CollaboratorInvite";
import { generateSecureToken, hashToken, isExpired } from "../utils/tokenHash";

function inviteExpiryDate(now: Date): Date {
  return new Date(now.getTime() + config.collaboratorInviteTtlDays * 24 * 60 * 60 * 1000);
}

/** Issues an invite, replacing any still-pending one for the same (owner, email) pair rather than accumulating duplicates from repeated invite clicks. */
export async function createInvite(
  ownerUserId: string,
  email: string,
  canApprove: boolean
): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();

  await CollaboratorInvite.deleteMany({
    ownerUserId: new Types.ObjectId(ownerUserId),
    email: normalizedEmail,
    acceptedAt: { $exists: false },
  });

  const raw = generateSecureToken();
  await CollaboratorInvite.create({
    ownerUserId: new Types.ObjectId(ownerUserId),
    email: normalizedEmail,
    canApprove,
    tokenHash: hashToken(raw),
    expiresAt: inviteExpiryDate(new Date()),
  });

  return raw;
}

export interface InvitePreview {
  ownerEmail: string;
  ownerName?: string;
  email: string;
  canApprove: boolean;
}

/** Public preview for the accept-invite page -- token is a high-entropy lookup key, so revealing this to an unauthenticated request carrying it is safe. */
export async function getInvitePreview(rawToken: string): Promise<InvitePreview | null> {
  const invite = await CollaboratorInvite.findOne({ tokenHash: hashToken(rawToken) });

  if (!invite || invite.acceptedAt || isExpired(invite.expiresAt, new Date())) {
    return null;
  }

  const owner = await User.findById(invite.ownerUserId);
  if (!owner) return null;

  return {
    ownerEmail: owner.email,
    ownerName: owner.name,
    email: invite.email,
    canApprove: invite.canApprove,
  };
}

/**
 * Accepts an invite on behalf of an authenticated user. The accepting
 * account's email must match the invite exactly -- an invite is a promise
 * to a specific email address, not a bearer credential anyone who has the
 * link can redeem as anyone.
 */
export class InviteNotFoundError extends Error {}
export class InviteEmailMismatchError extends Error {}

export async function acceptInvite(rawToken: string, acceptingUserId: string): Promise<void> {
  const invite = await CollaboratorInvite.findOne({ tokenHash: hashToken(rawToken) });

  if (!invite || invite.acceptedAt || isExpired(invite.expiresAt, new Date())) {
    throw new InviteNotFoundError("Invite not found or expired");
  }

  const acceptingUser = await User.findById(acceptingUserId);
  if (!acceptingUser || acceptingUser.email.toLowerCase() !== invite.email) {
    throw new InviteEmailMismatchError("This invite was sent to a different email address");
  }

  await Collaborator.findOneAndUpdate(
    { ownerUserId: invite.ownerUserId, collaboratorUserId: acceptingUser._id },
    { canApprove: invite.canApprove, $unset: { revokedAt: "" } },
    { upsert: true }
  );

  invite.acceptedAt = new Date();
  await invite.save();
}

export interface CollaboratorListRow {
  id: string;
  email: string;
  name?: string;
  canApprove: boolean;
  status: "pending" | "active" | "revoked";
  createdAt: Date;
}

/** Everyone an owner has invited -- accepted, still pending, and revoked, merged into one status-tagged list. */
export async function listCollaboratorsForOwner(ownerUserId: string): Promise<CollaboratorListRow[]> {
  const ownerId = new Types.ObjectId(ownerUserId);

  const [relationships, pendingInvites] = await Promise.all([
    Collaborator.find({ ownerUserId: ownerId }).populate<{ collaboratorUserId: { _id: Types.ObjectId; email: string; name?: string } }>(
      "collaboratorUserId",
      "email name"
    ),
    CollaboratorInvite.find({ ownerUserId: ownerId, acceptedAt: { $exists: false } }),
  ]);

  const relationshipRows: CollaboratorListRow[] = relationships.map((rel) => ({
    id: rel._id.toString(),
    email: rel.collaboratorUserId.email,
    name: rel.collaboratorUserId.name,
    canApprove: rel.canApprove,
    status: rel.revokedAt ? "revoked" : "active",
    createdAt: rel.createdAt,
  }));

  const pendingRows: CollaboratorListRow[] = pendingInvites
    .filter((invite) => !isExpired(invite.expiresAt, new Date()))
    .map((invite) => ({
      id: invite._id.toString(),
      email: invite.email,
      canApprove: invite.canApprove,
      status: "pending",
      createdAt: invite.createdAt,
    }));

  return [...relationshipRows, ...pendingRows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export interface OwnerListRow {
  collaboratorRowId: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName?: string;
  canApprove: boolean;
}

/** Every owner who's added the given user as an active collaborator. */
export async function listOwnersForCollaborator(collaboratorUserId: string): Promise<OwnerListRow[]> {
  const relationships = await Collaborator.find({
    collaboratorUserId: new Types.ObjectId(collaboratorUserId),
    revokedAt: { $exists: false },
  }).populate<{ ownerUserId: { _id: Types.ObjectId; email: string; name?: string } }>("ownerUserId", "email name");

  return relationships.map((rel) => ({
    collaboratorRowId: rel._id.toString(),
    ownerUserId: rel.ownerUserId._id.toString(),
    ownerEmail: rel.ownerUserId.email,
    ownerName: rel.ownerUserId.name,
    canApprove: rel.canApprove,
  }));
}

/**
 * Ends a collaborator relationship -- either side can do it (the owner
 * revoking, or the collaborator leaving), soft-marked so history stays
 * visible. Returns false if the row doesn't exist or the requester isn't
 * party to it.
 */
export async function endCollaboration(requestingUserId: string, collaboratorRowId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(collaboratorRowId)) return false;

  const relationship = await Collaborator.findById(collaboratorRowId);
  if (!relationship) return false;

  const requester = new Types.ObjectId(requestingUserId);
  const isParty =
    relationship.ownerUserId.equals(requester) || relationship.collaboratorUserId.equals(requester);
  if (!isParty) return false;

  relationship.revokedAt = new Date();
  await relationship.save();
  return true;
}

/** Whether an active (non-revoked) collaborator relationship exists -- used by resolveOwner and switch-owner. */
export async function hasActiveRelationship(ownerUserId: string, collaboratorUserId: string): Promise<boolean> {
  const relationship = await Collaborator.findOne({
    ownerUserId: new Types.ObjectId(ownerUserId),
    collaboratorUserId: new Types.ObjectId(collaboratorUserId),
    revokedAt: { $exists: false },
  }).lean();
  return Boolean(relationship);
}
