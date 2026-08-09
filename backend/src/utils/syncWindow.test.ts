import { describe, it, expect } from "vitest";
import { computeSyncFromDate } from "./syncWindow";

describe("computeSyncFromDate", () => {
  it("looks back 90 days when the account has never been synced", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const result = computeSyncFromDate(undefined, now);
    expect(result).toEqual(new Date("2026-03-03T00:00:00Z"));
  });

  it("resumes from 6 hours before the last sync when one exists", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const lastSyncedAt = new Date("2026-06-01T06:00:00Z");
    const result = computeSyncFromDate(lastSyncedAt, now);
    expect(result).toEqual(new Date("2026-06-01T00:00:00Z"));
  });

  it("applies exactly the 6-hour buffer at the boundary", () => {
    const lastSyncedAt = new Date("2026-06-01T06:00:00.000Z");
    const result = computeSyncFromDate(lastSyncedAt, new Date());
    expect(result.getTime()).toBe(lastSyncedAt.getTime() - 6 * 60 * 60 * 1000);
  });
});
