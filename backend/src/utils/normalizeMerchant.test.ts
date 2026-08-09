import { describe, it, expect } from "vitest";
import { normalizeMerchant } from "./normalizeMerchant";

describe("normalizeMerchant", () => {
  it("returns empty string for empty input", () => {
    expect(normalizeMerchant("")).toBe("");
  });

  it("strips card payment prefixes", () => {
    expect(normalizeMerchant("CARD PAYMENT TO TESCO STORES")).toBe("tesco stores");
    expect(normalizeMerchant("POS PAYMENT TO LIDL")).toBe("lidl");
    expect(normalizeMerchant("Online Payment to SPOTIFY")).toBe("spotify");
  });

  it("strips city and country suffixes regardless of source casing", () => {
    // The old implementation lowercased first, so its uppercase-only
    // country-code pattern could never match.
    expect(normalizeMerchant("STARBUCKS, DUBLIN")).toBe("starbucks");
    expect(normalizeMerchant("CARD PAYMENT TO SUPERMARKET, MALTA")).toBe("supermarket");
  });

  it("collapses Amazon reference codes to a clean name", () => {
    expect(normalizeMerchant("AMZN Mktp DE*2K4XY8901")).toBe("amazon");
    expect(normalizeMerchant("AMZN MKTP UK*M12AB3CD4")).toBe("amazon");
    expect(normalizeMerchant("AMAZON EU S.A.R.L.")).toBe("amazon");
  });

  it("collapses PayPal references to the underlying merchant", () => {
    expect(normalizeMerchant("PAYPAL *STEAM GAMES")).toBe("steam games");
    expect(normalizeMerchant("PayPal *NETFLIX")).toBe("netflix");
  });

  it("strips trailing reference numbers", () => {
    expect(normalizeMerchant("UBER EATS 8829301")).toBe("uber eats");
    expect(normalizeMerchant("TFL TRAVEL CH 4429")).toBe("tfl travel ch");
  });

  it("strips trailing #-prefixed store numbers, even short ones", () => {
    // Real example from bank-data-parsing writeups: a "#" is an unambiguous
    // store-number marker regardless of digit count, unlike a bare trailing
    // number (which needs 3+ digits to be treated as noise).
    expect(normalizeMerchant("SAPPS #06")).toBe("sapps");
    expect(normalizeMerchant("TARGET #5521")).toBe("target");
    expect(normalizeMerchant("WALGREENS #12")).toBe("walgreens");
  });

  it("removes asterisk reference codes from other providers", () => {
    expect(normalizeMerchant("SQ *COFFEE SHOP")).toBe("coffee shop");
    expect(normalizeMerchant("SUMUP *BAKERY")).toBe("bakery");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeMerchant("  TESCO    STORES  ")).toBe("tesco stores");
  });

  it("is idempotent", () => {
    const once = normalizeMerchant("CARD PAYMENT TO AMZN Mktp DE*2K4XY8901, BERLIN");
    expect(normalizeMerchant(once)).toBe(once);
  });

  it("leaves an already-clean merchant name untouched", () => {
    expect(normalizeMerchant("netflix")).toBe("netflix");
  });
});
