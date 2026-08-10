import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import request, { Test } from "supertest";
import type { Response } from "supertest";
import type { Express } from "express";

/**
 * The full collaborator loop -- invite, accept, switch context, act on
 * someone else's data, revoke -- is exactly the kind of multi-step,
 * cookie-dependent flow that needs a real DB and a real Express app rather
 * than mocks (same harness as auth.integration.test.ts).
 */

let mongod: MongoMemoryServer;
let app: Express;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { connectDatabase } = await import("../config/database");
  await connectDatabase();

  app = (await import("../app")).default;
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

type Agent = { post: (url: string) => Test; get: (url: string) => Test; delete: (url: string) => Test };

function agent(): Agent {
  return request.agent(app) as unknown as Agent;
}

function extractCsrfToken(res: Response): string {
  const setCookieHeader = res.headers["set-cookie"] as unknown as string[] | undefined;
  const csrfCookie = (setCookieHeader || []).find((c) => c.startsWith("bf_csrf="));
  if (!csrfCookie) throw new Error("No bf_csrf cookie in response");
  return csrfCookie.split(";")[0].split("=")[1];
}

async function registerAndGetCsrf(a: Agent, email: string, password = "password123") {
  const res = await a.post("/api/auth/register").send({ email, password });
  return { userId: res.body.user.id as string, csrf: extractCsrfToken(res) };
}

/** Seeds a pending transaction directly via the models -- CSV parsing specifics aren't what's under test here. */
async function seedPendingTransaction(ownerUserId: string) {
  const { Account } = await import("../models/Account");
  const { Transaction, ApprovalStatus } = await import("../models/Transaction");

  const account = await Account.create({
    ownerUserId: new Types.ObjectId(ownerUserId),
    providerAccountId: `test_account_${ownerUserId}`,
    name: "Test Account",
    currency: "EUR",
  });

  const transaction = await Transaction.create({
    ownerUserId: new Types.ObjectId(ownerUserId),
    accountId: account._id,
    providerTransactionId: `test_tx_${ownerUserId}`,
    bookedAt: new Date(),
    amount: -6000,
    currency: "EUR",
    rawDescription: "TEST MERCHANT",
    merchantNameNormalized: "test merchant",
    computedCategory: "Shopping",
    categoryOverridden: false,
    isGambling: false,
    isCrypto: false,
    isBlacklisted: false,
    isOverBudget: false,
    approvalRequired: true,
    approvalStatus: ApprovalStatus.PENDING,
  });

  return transaction._id.toString();
}

describe("collaborators: invite -> accept", () => {
  it("previews an invite, accepts it, and lists the relationship both directions", async () => {
    const ownerAgent = agent();
    const { csrf: ownerCsrf } = await registerAndGetCsrf(ownerAgent, "owner1@example.com");

    const inviteRes = await ownerAgent
      .post("/api/collaborators/invite")
      .set("X-CSRF-Token", ownerCsrf)
      .send({ email: "buddy1@example.com", canApprove: true });
    expect(inviteRes.status).toBe(201);
    const token = new URL(inviteRes.body.devInviteUrl).searchParams.get("token");

    const previewRes = await request(app).get(`/api/collaborators/invite/${token}`);
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.ownerEmail).toBe("owner1@example.com");
    expect(previewRes.body.email).toBe("buddy1@example.com");

    const buddyAgent = agent();
    const { csrf: buddyCsrf } = await registerAndGetCsrf(buddyAgent, "buddy1@example.com");

    const acceptRes = await buddyAgent
      .post(`/api/collaborators/invite/${token}/accept`)
      .set("X-CSRF-Token", buddyCsrf);
    expect(acceptRes.status).toBe(200);

    const ownerList = await ownerAgent.get("/api/collaborators");
    expect(ownerList.body).toEqual([
      expect.objectContaining({ email: "buddy1@example.com", status: "active", canApprove: true }),
    ]);

    const buddyOwners = await buddyAgent.get("/api/collaborators/owners");
    expect(buddyOwners.body).toEqual([
      expect.objectContaining({ ownerEmail: "owner1@example.com", canApprove: true }),
    ]);
  });

  it("rejects acceptance from an account whose email doesn't match the invite", async () => {
    const ownerAgent = agent();
    const { csrf: ownerCsrf } = await registerAndGetCsrf(ownerAgent, "owner2@example.com");

    const inviteRes = await ownerAgent
      .post("/api/collaborators/invite")
      .set("X-CSRF-Token", ownerCsrf)
      .send({ email: "intended@example.com" });
    const token = new URL(inviteRes.body.devInviteUrl).searchParams.get("token");

    const wrongAgent = agent();
    const { csrf: wrongCsrf } = await registerAndGetCsrf(wrongAgent, "someone-else@example.com");

    const acceptRes = await wrongAgent
      .post(`/api/collaborators/invite/${token}/accept`)
      .set("X-CSRF-Token", wrongCsrf);
    expect(acceptRes.status).toBe(403);
  });
});

describe("collaborators: switch -> view -> approve", () => {
  it("lets an approve-flagged collaborator view and approve the owner's data, but not reconfigure it", async () => {
    const ownerAgent = agent();
    const { userId: ownerId, csrf: ownerCsrf } = await registerAndGetCsrf(ownerAgent, "owner3@example.com");

    const inviteRes = await ownerAgent
      .post("/api/collaborators/invite")
      .set("X-CSRF-Token", ownerCsrf)
      .send({ email: "buddy3@example.com", canApprove: true });
    const token = new URL(inviteRes.body.devInviteUrl).searchParams.get("token");

    const buddyAgent = agent();
    const { csrf: buddyCsrf } = await registerAndGetCsrf(buddyAgent, "buddy3@example.com");
    await buddyAgent.post(`/api/collaborators/invite/${token}/accept`).set("X-CSRF-Token", buddyCsrf);

    const transactionId = await seedPendingTransaction(ownerId);

    const switchRes = await buddyAgent
      .post("/api/me/switch-owner")
      .set("X-CSRF-Token", buddyCsrf)
      .send({ ownerUserId: ownerId });
    expect(switchRes.status).toBe(200);
    expect(switchRes.body.actingAs.email).toBe("owner3@example.com");

    const viewRes = await buddyAgent.get("/api/transactions");
    expect(viewRes.status).toBe(200);
    expect(viewRes.body.data.map((t: { id: string }) => t.id)).toContain(transactionId);

    // Owner-only write, blocked for a collaborator regardless of canApprove.
    const blockedRes = await buddyAgent
      .post("/api/intents")
      .set("X-CSRF-Token", buddyCsrf)
      .send({});
    expect(blockedRes.status).toBe(403);

    const approveRes = await buddyAgent
      .post(`/api/transactions/${transactionId}/approve`)
      .set("X-CSRF-Token", buddyCsrf)
      .send({ note: "looks fine" });
    expect(approveRes.status).toBe(200);

    const historyRes = await ownerAgent.get(`/api/transactions/${transactionId}/approvals`);
    expect(historyRes.body).toHaveLength(1);

    const { Approval } = await import("../models/Approval");
    const approvalDoc = await Approval.findOne({ targetId: transactionId });
    expect(approvalDoc?.ownerUserId.toString()).toBe(ownerId);
    expect(approvalDoc?.actorUserId.toString()).not.toBe(ownerId);
  });

  it("blocks approve/deny for a collaborator without canApprove", async () => {
    const ownerAgent = agent();
    const { userId: ownerId, csrf: ownerCsrf } = await registerAndGetCsrf(ownerAgent, "owner4@example.com");

    const inviteRes = await ownerAgent
      .post("/api/collaborators/invite")
      .set("X-CSRF-Token", ownerCsrf)
      .send({ email: "viewer4@example.com", canApprove: false });
    const token = new URL(inviteRes.body.devInviteUrl).searchParams.get("token");

    const viewerAgent = agent();
    const { csrf: viewerCsrf } = await registerAndGetCsrf(viewerAgent, "viewer4@example.com");
    await viewerAgent.post(`/api/collaborators/invite/${token}/accept`).set("X-CSRF-Token", viewerCsrf);

    const transactionId = await seedPendingTransaction(ownerId);

    await viewerAgent
      .post("/api/me/switch-owner")
      .set("X-CSRF-Token", viewerCsrf)
      .send({ ownerUserId: ownerId });

    const denyRes = await viewerAgent
      .post(`/api/transactions/${transactionId}/deny`)
      .set("X-CSRF-Token", viewerCsrf)
      .send({});
    expect(denyRes.status).toBe(403);
  });
});

describe("collaborators: revoke and leave", () => {
  it("silently reverts an acting-as collaborator to their own data once revoked", async () => {
    const ownerAgent = agent();
    const { csrf: ownerCsrf } = await registerAndGetCsrf(ownerAgent, "owner5@example.com");

    const inviteRes = await ownerAgent
      .post("/api/collaborators/invite")
      .set("X-CSRF-Token", ownerCsrf)
      .send({ email: "buddy5@example.com" });
    const token = new URL(inviteRes.body.devInviteUrl).searchParams.get("token");

    const buddyAgent = agent();
    const { csrf: buddyCsrf } = await registerAndGetCsrf(buddyAgent, "buddy5@example.com");
    await buddyAgent.post(`/api/collaborators/invite/${token}/accept`).set("X-CSRF-Token", buddyCsrf);

    const ownerList = await ownerAgent.get("/api/collaborators");
    const relationshipId = ownerList.body[0].id;
    const ownerId = (await ownerAgent.get("/api/me")).body.id;

    await buddyAgent
      .post("/api/me/switch-owner")
      .set("X-CSRF-Token", buddyCsrf)
      .send({ ownerUserId: ownerId });

    const revokeRes = await ownerAgent
      .delete(`/api/collaborators/${relationshipId}`)
      .set("X-CSRF-Token", ownerCsrf);
    expect(revokeRes.status).toBe(200);

    // The buddy still holds the acting-as cookie, but the relationship is
    // gone -- the next request should silently show their own (empty) data.
    const afterRevokeRes = await buddyAgent.get("/api/transactions");
    expect(afterRevokeRes.status).toBe(200);
    expect(afterRevokeRes.body.data).toEqual([]);
  });

  it("lets a collaborator leave a relationship on their own", async () => {
    const ownerAgent = agent();
    const { csrf: ownerCsrf } = await registerAndGetCsrf(ownerAgent, "owner6@example.com");

    const inviteRes = await ownerAgent
      .post("/api/collaborators/invite")
      .set("X-CSRF-Token", ownerCsrf)
      .send({ email: "buddy6@example.com" });
    const token = new URL(inviteRes.body.devInviteUrl).searchParams.get("token");

    const buddyAgent = agent();
    const { csrf: buddyCsrf } = await registerAndGetCsrf(buddyAgent, "buddy6@example.com");
    await buddyAgent.post(`/api/collaborators/invite/${token}/accept`).set("X-CSRF-Token", buddyCsrf);

    const ownersRes = await buddyAgent.get("/api/collaborators/owners");
    const relationshipId = ownersRes.body[0].collaboratorRowId;

    const leaveRes = await buddyAgent
      .delete(`/api/collaborators/${relationshipId}`)
      .set("X-CSRF-Token", buddyCsrf);
    expect(leaveRes.status).toBe(200);

    const ownersAfter = await buddyAgent.get("/api/collaborators/owners");
    expect(ownersAfter.body).toEqual([]);
  });
});

describe("collaborators: notifications", () => {
  it("notifies an active canApprove collaborator exactly once when a CSV import creates a pending transaction", async () => {
    const ownerAgent = agent();
    const { userId: ownerId, csrf: ownerCsrf } = await registerAndGetCsrf(ownerAgent, "owner7@example.com");

    const inviteRes = await ownerAgent
      .post("/api/collaborators/invite")
      .set("X-CSRF-Token", ownerCsrf)
      .send({ email: "buddy7@example.com", canApprove: true });
    const token = new URL(inviteRes.body.devInviteUrl).searchParams.get("token");

    const buddyAgent = agent();
    const { csrf: buddyCsrf } = await registerAndGetCsrf(buddyAgent, "buddy7@example.com");
    await buddyAgent.post(`/api/collaborators/invite/${token}/accept`).set("X-CSRF-Token", buddyCsrf);

    // A single transaction above the default €50 approval threshold --
    // lands PENDING and should trigger exactly one notification.
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "Card Payment,Current,2026-01-01,2026-01-01,Big Purchase,-60.00,0,EUR,COMPLETED,100.00",
    ].join("\n");

    const { importTransactionsFromCSV } = await import("../services/csvImport.service");
    await importTransactionsFromCSV(ownerId, csv);

    const notificationsRes = await buddyAgent.get("/api/notifications");
    expect(notificationsRes.status).toBe(200);
    const pendingApprovalNotifications = notificationsRes.body.filter(
      (n: { type: string }) => n.type === "PENDING_APPROVAL"
    );
    expect(pendingApprovalNotifications).toHaveLength(1);
    expect(pendingApprovalNotifications[0].message).toMatch(/1 new transaction needs approval/);
  });
});
