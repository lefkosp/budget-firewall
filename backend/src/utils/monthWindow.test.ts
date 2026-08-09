import { describe, it, expect, afterEach } from "vitest";
import { monthKey, addUTCMonths, startOfUTCMonth, endOfUTCMonth } from "./monthWindow";

const originalTZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTZ;
});

describe("monthKey", () => {
  it("keys by UTC calendar month", () => {
    expect(monthKey(new Date("2025-03-15T12:00:00Z"))).toBe("2025-03");
  });

  it("is unaffected by server-local timezone at a month boundary", () => {
    // UTC midnight on March 1st is still the last day of February in any
    // timezone behind UTC -- monthKey must not shift with it.
    const date = new Date("2025-03-01T00:00:00Z");
    process.env.TZ = "America/New_York"; // UTC-5
    expect(monthKey(date)).toBe("2025-03");
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14
    expect(monthKey(date)).toBe("2025-03");
  });
});

describe("addUTCMonths", () => {
  it("shifts forward and backward across year boundaries", () => {
    expect(monthKey(addUTCMonths(new Date("2025-01-15T00:00:00Z"), -1))).toBe("2024-12");
    expect(monthKey(addUTCMonths(new Date("2025-12-15T00:00:00Z"), 1))).toBe("2026-01");
  });

  it("anchors the result to day 1 UTC midnight", () => {
    const result = addUTCMonths(new Date("2025-06-27T18:45:00Z"), 0);
    expect(result.toISOString()).toBe("2025-06-01T00:00:00.000Z");
  });
});

describe("startOfUTCMonth / endOfUTCMonth", () => {
  it("bracket the full UTC month regardless of server timezone", () => {
    process.env.TZ = "America/New_York";
    const date = new Date("2025-03-15T12:00:00Z");
    expect(startOfUTCMonth(date).toISOString()).toBe("2025-03-01T00:00:00.000Z");
    expect(endOfUTCMonth(date).toISOString()).toBe("2025-03-31T23:59:59.999Z");
  });

  it("handles a 31-day and a 28-day month correctly", () => {
    expect(endOfUTCMonth(new Date("2025-01-10T00:00:00Z")).getUTCDate()).toBe(31);
    expect(endOfUTCMonth(new Date("2025-02-10T00:00:00Z")).getUTCDate()).toBe(28);
    expect(endOfUTCMonth(new Date("2024-02-10T00:00:00Z")).getUTCDate()).toBe(29); // leap year
  });

  it("a transaction at UTC month-end still falls within its own month's window", () => {
    // The exact scenario this whole fix exists for: a transaction dated at
    // UTC midnight on the 1st must be found by a query bracketing *that*
    // month, not shifted into the previous one by local-time arithmetic.
    const txDate = new Date("2025-03-01T00:00:00Z");
    const start = startOfUTCMonth(txDate);
    const end = endOfUTCMonth(txDate);
    expect(txDate.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(txDate.getTime()).toBeLessThanOrEqual(end.getTime());
  });
});
