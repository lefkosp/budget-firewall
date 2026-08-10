import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { Approval, ApprovalDecision, ApprovalTargetType } from "../models/Approval";
import { ApprovalStatus } from "../models/Transaction";
import { notifyCollaboratorDecision } from "./notification.service";

export interface DecideTransactionResult {
  transaction: {
    id: string;
    approvalStatus: ApprovalStatus;
  };
  approval: {
    id: string;
    decision: ApprovalDecision;
    note?: string;
    createdAt: Date;
  };
}

/**
 * Records an approve/deny decision on a transaction and moves its status.
 * The decision itself is logged as an immutable Approval document rather
 * than just overwriting a field -- that's what makes "approval history"
 * possible. actorUserId is separate from ownerUserId so a collaborator
 * (see DEVELOPMENT_PLAN.md Phase 6, routes/transactions.ts's
 * requireCanApprove guard) can act on the owner's behalf with the record
 * showing who actually made the call.
 */
export async function decideTransaction(
  ownerUserId: string,
  actorUserId: string,
  transactionId: string,
  decision: ApprovalDecision,
  note: string | undefined
): Promise<DecideTransactionResult | null> {
  const transaction = await Transaction.findOne({
    _id: transactionId,
    ownerUserId: new Types.ObjectId(ownerUserId),
  });

  if (!transaction) {
    return null;
  }

  const approval = await Approval.create({
    ownerUserId: new Types.ObjectId(ownerUserId),
    actorUserId: new Types.ObjectId(actorUserId),
    targetType: ApprovalTargetType.TRANSACTION,
    targetId: transaction._id.toString(),
    decision,
    note,
  });

  transaction.approvalStatus =
    decision === ApprovalDecision.APPROVED ? ApprovalStatus.APPROVED : ApprovalStatus.DENIED;
  await transaction.save();

  await notifyCollaboratorDecision(
    ownerUserId,
    actorUserId,
    decision === ApprovalDecision.APPROVED ? "approved" : "denied",
    transaction.merchantNameNormalized
  );

  return {
    transaction: {
      id: transaction._id.toString(),
      approvalStatus: transaction.approvalStatus,
    },
    approval: {
      id: approval._id.toString(),
      decision: approval.decision,
      note: approval.note,
      createdAt: approval.createdAt,
    },
  };
}

export async function getTransactionApprovalHistory(ownerUserId: string, transactionId: string) {
  return Approval.find({
    ownerUserId: new Types.ObjectId(ownerUserId),
    targetType: ApprovalTargetType.TRANSACTION,
    targetId: transactionId,
  })
    .sort({ createdAt: -1 })
    .lean();
}
