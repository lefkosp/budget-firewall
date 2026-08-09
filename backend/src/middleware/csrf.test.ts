import { describe, it, expect } from "vitest";
import { csrfTokenValid } from "./csrf";

describe("csrfTokenValid", () => {
  it("passes when the cookie and header values match", () => {
    expect(csrfTokenValid("token-abc", "token-abc")).toBe(true);
  });

  it("fails when the cookie is missing", () => {
    expect(csrfTokenValid(undefined, "token-abc")).toBe(false);
  });

  it("fails when the header is missing", () => {
    expect(csrfTokenValid("token-abc", undefined)).toBe(false);
  });

  it("fails when both are missing", () => {
    expect(csrfTokenValid(undefined, undefined)).toBe(false);
  });

  it("fails when the values mismatch", () => {
    expect(csrfTokenValid("token-abc", "token-xyz")).toBe(false);
  });

  it("fails on an empty-string cookie, even if it matches an empty header", () => {
    expect(csrfTokenValid("", "")).toBe(false);
  });
});
