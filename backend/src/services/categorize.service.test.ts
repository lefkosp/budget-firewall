import { describe, it, expect } from "vitest";
import { categorizeTransaction } from "./categorize.service";
import { normalizeMerchant } from "../utils/normalizeMerchant";

/** Mirrors how the import pipeline calls it: normalize, then categorize. */
function categorize(rawDescription: string, amount = -1000, transactionType?: string) {
  return categorizeTransaction({
    merchantNameNormalized: normalizeMerchant(rawDescription),
    rawDescription,
    amount,
    transactionType,
  });
}

describe("categorizeTransaction", () => {
  it("categorizes supermarkets as Groceries", () => {
    expect(categorize("CARD PAYMENT TO TESCO STORES")).toBe("Groceries");
    expect(categorize("LIDL")).toBe("Groceries");
    expect(categorize("POS PAYMENT TO ALDI, DUBLIN")).toBe("Groceries");
  });

  it("categorizes restaurants and delivery as Eating Out", () => {
    expect(categorize("STARBUCKS COFFEE")).toBe("Eating Out");
    expect(categorize("UBER EATS 8829301")).toBe("Eating Out");
    expect(categorize("DELIVEROO")).toBe("Eating Out");
    expect(categorize("MCDONALDS")).toBe("Eating Out");
  });

  it("categorizes transport", () => {
    expect(categorize("UBER TRIP")).toBe("Transport");
    expect(categorize("TFL TRAVEL CH")).toBe("Transport");
    expect(categorize("SHELL")).toBe("Transport");
  });

  it("categorizes streaming and recurring services as Subscriptions", () => {
    expect(categorize("NETFLIX")).toBe("Subscriptions");
    expect(categorize("PAYPAL *SPOTIFY")).toBe("Subscriptions");
    expect(categorize("DISNEY PLUS")).toBe("Subscriptions");
  });

  it("categorizes utilities and telecoms as Bills & Utilities", () => {
    expect(categorize("VODAFONE")).toBe("Bills & Utilities");
    expect(categorize("ELECTRIC IRELAND")).toBe("Bills & Utilities");
  });

  it("categorizes retail as Shopping", () => {
    expect(categorize("AMZN Mktp DE*2K4XY8901")).toBe("Shopping");
    expect(categorize("IKEA")).toBe("Shopping");
  });

  it("categorizes airlines and hotels as Travel", () => {
    expect(categorize("RYANAIR")).toBe("Travel");
    expect(categorize("BOOKING.COM")).toBe("Travel");
  });

  it("categorizes pharmacies and clinics as Health", () => {
    expect(categorize("BOOTS PHARMACY")).toBe("Health");
  });

  it("still categorizes gambling and crypto merchants by what they are", () => {
    // Gambling/crypto are flags, not categories -- the merchant still gets a
    // real category so it shows up correctly in spending breakdowns.
    expect(categorize("BET365.COM")).toBe("Entertainment");
    expect(categorize("CARD PAYMENT TO BINANCE")).toBe("Shopping");
  });

  it("treats positive amounts as Income", () => {
    expect(categorize("SALARY ACME LTD", 350000)).toBe("Income");
    expect(categorize("PAYROLL", 250000)).toBe("Income");
  });

  it("detects transfers and top-ups regardless of sign", () => {
    expect(categorize("TOP-UP BY CARD", 10000)).toBe("Transfers");
    expect(categorize("TRANSFER TO SAVINGS", -50000)).toBe("Transfers");
    expect(categorize("TO JOHN SMITH", -2000, "TRANSFER")).toBe("Transfers");
  });

  it("detects fees", () => {
    expect(categorize("ATM WITHDRAWAL FEE", -250)).toBe("Fees");
    expect(categorize("CARD DELIVERY FEE", -500)).toBe("Fees");
  });

  it("falls back to Other for unrecognized merchants", () => {
    expect(categorize("ACME WIDGETS")).toBe("Other");
  });

  it("uses generic keywords to catch the long tail", () => {
    // Deliberate: a merchant we've never seen but whose name says what it is
    // should still land somewhere better than Other.
    expect(categorize("SOME RANDOM LOCAL SHOP")).toBe("Shopping");
    expect(categorize("THE CORNER CAFE")).toBe("Eating Out");
  });

  it("never returns 'unknown'", () => {
    // The old pipeline defaulted to the literal string "unknown", which made
    // nearly every real import uncategorized.
    expect(categorize("ZZZ UNRECOGNIZABLE")).not.toBe("unknown");
  });

  describe("manual merchant mapping", () => {
    it("overrides the keyword table for a mapped merchant", () => {
      const map = new Map([["tesco stores", "Entertainment"]]);
      // Would ordinarily be Groceries -- the user's correction wins.
      expect(categorize("CARD PAYMENT TO TESCO STORES")).toBe("Groceries");
      expect(
        categorizeTransaction(
          { merchantNameNormalized: "tesco stores", rawDescription: "CARD PAYMENT TO TESCO STORES", amount: -1000 },
          map
        )
      ).toBe("Entertainment");
    });

    it("outranks fee/transfer/income detection too", () => {
      const map = new Map([["acme corp", "Subscriptions"]]);
      expect(
        categorizeTransaction(
          { merchantNameNormalized: "acme corp", rawDescription: "SALARY FROM ACME CORP", amount: 300000 },
          map
        )
      ).toBe("Subscriptions");
    });

    it("falls through to the table for merchants not in the map", () => {
      const map = new Map([["some other merchant", "Health"]]);
      expect(
        categorizeTransaction(
          { merchantNameNormalized: "netflix", rawDescription: "NETFLIX", amount: -1000 },
          map
        )
      ).toBe("Subscriptions");
    });
  });
});
