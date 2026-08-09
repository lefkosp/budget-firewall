import { describe, it, expect } from "vitest";
import { parseDate, parseCSVTransactions } from "./csvParser";

/** Asserts the date lands on the expected UTC calendar day, sidestepping server-timezone drift. */
function expectUTCDate(date: Date | null, year: number, month: number, day: number) {
  expect(date).not.toBeNull();
  expect(date!.getUTCFullYear()).toBe(year);
  expect(date!.getUTCMonth()).toBe(month - 1);
  expect(date!.getUTCDate()).toBe(day);
}

describe("parseDate", () => {
  it("parses ISO YYYY-MM-DD unambiguously", () => {
    expectUTCDate(parseDate("2025-03-05"), 2025, 3, 5);
  });

  it("parses ISO with a time suffix", () => {
    expectUTCDate(parseDate("2025-03-05T14:30:00Z"), 2025, 3, 5);
  });

  it("treats slash-separated dates as day-first (DD/MM/YYYY), not month-first", () => {
    // The bug this guards against: "5 March" was silently misread as
    // "3 May" because the native Date constructor was tried first, and it
    // assumes US MM/DD/YYYY. Every day-of-month <= 12 was affected.
    expectUTCDate(parseDate("05/03/2025"), 2025, 3, 5);
    expectUTCDate(parseDate("01/12/2025"), 2025, 12, 1);
    expectUTCDate(parseDate("12/01/2025"), 2025, 1, 12);
  });

  it("still parses day-first dates where the day is unambiguous (>12)", () => {
    expectUTCDate(parseDate("13/03/2025"), 2025, 3, 13);
    expectUTCDate(parseDate("31/01/2025"), 2025, 1, 31);
  });

  it("treats dash-separated dates as day-first too (DD-MM-YYYY)", () => {
    expectUTCDate(parseDate("05-03-2025"), 2025, 3, 5);
  });

  it("parses YYYY/MM/DD", () => {
    expectUTCDate(parseDate("2025/03/05"), 2025, 3, 5);
  });

  it("returns null for an empty string", () => {
    expect(parseDate("")).toBeNull();
  });

  it("returns null for unparseable garbage", () => {
    expect(parseDate("not a date")).toBeNull();
  });

  it("is not sensitive to server-local timezone", () => {
    // Every branch anchors to UTC midnight -- the calendar day shouldn't
    // shift regardless of what timezone the process happens to run in.
    const date = parseDate("2025-01-01")!;
    expect(date.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });
});

describe("parseCSVTransactions -- duplicate transaction IDs", () => {
  const REVOLUT_CSV = (rows: string) =>
    `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n${rows}`;

  it("gives two genuinely separate same-day, same-amount, same-merchant charges distinct IDs", () => {
    // Two identical coffees at the same shop on the same day -- same
    // account, date, amount, and description, but two real transactions.
    const csv = REVOLUT_CSV(
      "Card Payment,Current,2025-08-14,2025-08-14,Coffee Shop,-3.50,,EUR,COMPLETED,\n" +
        "Card Payment,Current,2025-08-14,2025-08-14,Coffee Shop,-3.50,,EUR,COMPLETED,\n"
    );

    const parsed = parseCSVTransactions(csv, "acct1");

    expect(parsed).toHaveLength(2);
    expect(parsed[0].providerTransactionId).not.toBe(parsed[1].providerTransactionId);
  });

  it("reproduces the same IDs when the exact same file is parsed again (re-import idempotency)", () => {
    const csv = REVOLUT_CSV(
      "Card Payment,Current,2025-08-14,2025-08-14,Coffee Shop,-3.50,,EUR,COMPLETED,\n" +
        "Card Payment,Current,2025-08-14,2025-08-14,Coffee Shop,-3.50,,EUR,COMPLETED,\n" +
        "Card Payment,Current,2025-08-15,2025-08-15,Lidl,-12.00,,EUR,COMPLETED,\n"
    );

    const first = parseCSVTransactions(csv, "acct1");
    const second = parseCSVTransactions(csv, "acct1");

    expect(second.map((t) => t.providerTransactionId)).toEqual(
      first.map((t) => t.providerTransactionId)
    );
  });

  it("still gives unrelated transactions their own distinct IDs", () => {
    const csv = REVOLUT_CSV(
      "Card Payment,Current,2025-08-14,2025-08-14,Coffee Shop,-3.50,,EUR,COMPLETED,\n" +
        "Card Payment,Current,2025-08-15,2025-08-15,Lidl,-12.00,,EUR,COMPLETED,\n"
    );

    const parsed = parseCSVTransactions(csv, "acct1");
    const ids = parsed.map((t) => t.providerTransactionId);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
