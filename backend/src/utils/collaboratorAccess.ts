/**
 * Pure predicates for the collaborator permission model (DEVELOPMENT_PLAN.md
 * Phase 6). By construction, resolveOwner.ts only ever sets a non-self
 * `req.ownerUserId` after the DB has confirmed an active Collaborator
 * relationship -- so canViewOwnerData has no route where it needs a second
 * DB-backed check; it exists so the rule is named and independently
 * testable, not because view access needs re-verifying per call.
 */

export function canViewOwnerData(userId: string, ownerUserId: string, hasActiveRelationship: boolean): boolean {
  return userId === ownerUserId || hasActiveRelationship;
}

export function canApprove(
  userId: string,
  ownerUserId: string,
  collaboratorCanApprove: boolean | undefined
): boolean {
  return userId === ownerUserId || Boolean(collaboratorCanApprove);
}

/** A collaborator's job is to view and approve/deny, not reconfigure the owner's budgets/rules/intents -- those actions stay owner-only regardless of role. */
export function isOwnerOnlyAction(userId: string, ownerUserId: string): boolean {
  return userId === ownerUserId;
}
