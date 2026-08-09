import { describe, it, expect } from "vitest";
import { escapeRegex } from "./escapeRegex";

describe("escapeRegex", () => {
  it("leaves plain text unchanged", () => {
    expect(escapeRegex("tesco")).toBe("tesco");
    expect(escapeRegex("Amazon UK")).toBe("Amazon UK");
  });

  it("escapes every regex metacharacter", () => {
    expect(escapeRegex(".*+?^${}()|[]\\")).toBe(
      "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\"
    );
  });

  it("matches only the literal search term once escaped, not any pattern it could be interpreted as", () => {
    // ".*" would match everything as a pattern; escaped, it matches only
    // the literal two-character string ".*".
    const pattern = escapeRegex(".*");
    const re = new RegExp(pattern, "i");
    expect(re.test(".*")).toBe(true);
    expect(re.test("anything at all")).toBe(false);
  });

  it("neutralizes a pathological ReDoS-shaped input into a literal, harmless match", () => {
    const malicious = "(a+)+$";
    const pattern = escapeRegex(malicious);
    const re = new RegExp(pattern, "i");
    expect(re.test(malicious)).toBe(true);
    expect(re.test("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab")).toBe(false);
  });
});
