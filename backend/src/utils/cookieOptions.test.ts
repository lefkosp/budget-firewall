import { describe, it, expect } from "vitest";
import { getCookieOptions } from "./cookieOptions";

describe("getCookieOptions", () => {
  it("uses Lax/insecure cookies in development, for same-site localhost ports", () => {
    expect(getCookieOptions("development")).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  });

  it("uses None/Secure cookies in production, for cross-site frontend/backend domains", () => {
    expect(getCookieOptions("production")).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
  });

  it("treats any non-production value as development", () => {
    expect(getCookieOptions("test")).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  });
});
