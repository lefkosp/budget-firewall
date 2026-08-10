import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import { requireOwnerSelf, requireCanApprove } from "./resolveOwner";
import type { AuthRequest } from "../types";

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockReq(userId: string, ownerUserId: string, collaboratorContext: AuthRequest["collaboratorContext"] = null) {
  return { userId, ownerUserId, collaboratorContext } as unknown as AuthRequest;
}

describe("requireOwnerSelf", () => {
  it("allows the owner acting on their own data", () => {
    const next = vi.fn();
    const res = mockRes();
    requireOwnerSelf(mockReq("user-1", "user-1"), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks a collaborator, even one with canApprove", () => {
    const next = vi.fn();
    const res = mockRes();
    requireOwnerSelf(mockReq("user-2", "user-1", { ownerUserId: "user-1", canApprove: true }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("requireCanApprove", () => {
  it("always allows the owner", () => {
    const next = vi.fn();
    const res = mockRes();
    requireCanApprove(mockReq("user-1", "user-1"), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows a collaborator flagged canApprove", () => {
    const next = vi.fn();
    const res = mockRes();
    requireCanApprove(mockReq("user-2", "user-1", { ownerUserId: "user-1", canApprove: true }), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("blocks a collaborator without canApprove", () => {
    const next = vi.fn();
    const res = mockRes();
    requireCanApprove(mockReq("user-2", "user-1", { ownerUserId: "user-1", canApprove: false }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("blocks when there's no collaborator context at all (resolveOwner already fell back to self, but defends in depth)", () => {
    const next = vi.fn();
    const res = mockRes();
    requireCanApprove(mockReq("user-2", "user-1", null), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
