import { describe, it, expect } from "vitest";
import { canViewOwnerData, canApprove, isOwnerOnlyAction } from "./collaboratorAccess";

describe("canViewOwnerData", () => {
  it("allows the owner to view their own data regardless of the relationship flag", () => {
    expect(canViewOwnerData("user-1", "user-1", false)).toBe(true);
  });

  it("allows a collaborator with an active relationship", () => {
    expect(canViewOwnerData("user-2", "user-1", true)).toBe(true);
  });

  it("denies a non-owner without an active relationship", () => {
    expect(canViewOwnerData("user-2", "user-1", false)).toBe(false);
  });
});

describe("canApprove", () => {
  it("always allows the owner", () => {
    expect(canApprove("user-1", "user-1", false)).toBe(true);
    expect(canApprove("user-1", "user-1", undefined)).toBe(true);
  });

  it("allows a collaborator flagged canApprove", () => {
    expect(canApprove("user-2", "user-1", true)).toBe(true);
  });

  it("denies a collaborator not flagged canApprove", () => {
    expect(canApprove("user-2", "user-1", false)).toBe(false);
    expect(canApprove("user-2", "user-1", undefined)).toBe(false);
  });
});

describe("isOwnerOnlyAction", () => {
  it("passes for the owner", () => {
    expect(isOwnerOnlyAction("user-1", "user-1")).toBe(true);
  });

  it("fails for anyone else, regardless of collaborator status", () => {
    expect(isOwnerOnlyAction("user-2", "user-1")).toBe(false);
  });
});
