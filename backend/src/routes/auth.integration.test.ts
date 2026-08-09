import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request, { Test } from "supertest";
import type { Response } from "supertest";
import type { Express } from "express";

/**
 * The only DB-round-trip-dependent logic in the codebase (cookie issuance,
 * DB-backed refresh-token rotation/revocation, password-reset redemption)
 * -- everything else in the test suite is pure functions. Runs against a
 * real in-memory Mongo and the real Express app, not mocks.
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

function extractCsrfToken(res: Response): string {
  const setCookieHeader = res.headers["set-cookie"] as unknown as string[] | undefined;
  const csrfCookie = (setCookieHeader || []).find((c) => c.startsWith("bf_csrf="));
  if (!csrfCookie) throw new Error("No bf_csrf cookie in response");
  return csrfCookie.split(";")[0].split("=")[1];
}

function hasCookieNamed(res: Response, name: string): boolean {
  const setCookieHeader = res.headers["set-cookie"] as unknown as string[] | undefined;
  return (setCookieHeader || []).some((c) => c.startsWith(`${name}=`));
}

describe("auth flow: register -> /api/me -> refresh -> logout", () => {
  it("issues cookie-based sessions, refreshes them, and revokes on logout", async () => {
    const agent = request.agent(app) as unknown as { post: (url: string) => Test; get: (url: string) => Test };

    const registerRes = await agent.post("/api/auth/register").send({
      email: "flow1@example.com",
      password: "password123",
      name: "Flow One",
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.user.email).toBe("flow1@example.com");
    expect(registerRes.body.token).toBeUndefined(); // no JWT in the body -- cookie-only
    expect(hasCookieNamed(registerRes, "bf_access")).toBe(true);
    expect(hasCookieNamed(registerRes, "bf_refresh")).toBe(true);

    const meRes = await agent.get("/api/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe("flow1@example.com");

    const csrfToken = extractCsrfToken(registerRes);
    const refreshRes = await agent.post("/api/auth/refresh").set("X-CSRF-Token", csrfToken);
    expect(refreshRes.status).toBe(200);
    const rotatedCsrfToken = extractCsrfToken(refreshRes);

    const meAfterRefresh = await agent.get("/api/me");
    expect(meAfterRefresh.status).toBe(200);

    const logoutRes = await agent.post("/api/auth/logout").set("X-CSRF-Token", rotatedCsrfToken);
    expect(logoutRes.status).toBe(200);

    const meAfterLogout = await agent.get("/api/me");
    expect(meAfterLogout.status).toBe(401);
  });
});

describe("password reset flow: forgot-password -> reset-password -> login", () => {
  it("lets a user reset their password and revokes every prior session", async () => {
    const sessionAgent = request.agent(app) as unknown as { post: (url: string) => Test; get: (url: string) => Test };

    const registerRes = await sessionAgent.post("/api/auth/register").send({
      email: "flow2@example.com",
      password: "oldpassword123",
    });
    expect(registerRes.status).toBe(201);

    const meBeforeReset = await sessionAgent.get("/api/me");
    expect(meBeforeReset.status).toBe(200);

    const forgotRes = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "flow2@example.com" });
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.devResetUrl).toBeDefined();
    const token = new URL(forgotRes.body.devResetUrl).searchParams.get("token");

    const resetRes = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "newpassword456" });
    expect(resetRes.status).toBe(200);

    // The session from before the reset should no longer be able to refresh --
    // reset-password revokes every refresh token the user held.
    const csrfBeforeReset = extractCsrfToken(registerRes);
    const refreshAfterReset = await sessionAgent
      .post("/api/auth/refresh")
      .set("X-CSRF-Token", csrfBeforeReset);
    expect(refreshAfterReset.status).toBe(401);

    const loginWithOldPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "flow2@example.com", password: "oldpassword123" });
    expect(loginWithOldPassword.status).toBe(401);

    const loginWithNewPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: "flow2@example.com", password: "newpassword456" });
    expect(loginWithNewPassword.status).toBe(200);
  });

  it("rejects a reset token that's already been used", async () => {
    await request(app).post("/api/auth/register").send({
      email: "flow3@example.com",
      password: "password123",
    });

    const forgotRes = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "flow3@example.com" });
    const token = new URL(forgotRes.body.devResetUrl).searchParams.get("token");

    const firstReset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "firstNewPassword" });
    expect(firstReset.status).toBe(200);

    const secondReset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "secondNewPassword" });
    expect(secondReset.status).toBe(400);
  });
});
