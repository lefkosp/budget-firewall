import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { Approval, ApprovalDecision, ApprovalTargetType } from "../models/Approval";
import { ApprovalStatus } from "../models/Transaction";

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
 * possible, and it's the same mechanism a collaborator will use later to
 * approve/deny on the owner's behalf (see DEVELOPMENT_PLAN.md Phase 6):
 * actorUserId is already separate from ownerUserId here for that reason,
 * even though today they're always the same person.
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
