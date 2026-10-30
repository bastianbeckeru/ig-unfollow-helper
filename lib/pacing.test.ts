import { describe, expect, it } from "vitest";
import { canSync, pruneLog, randomDelay, unfollowQuota } from "./pacing";
import { newJob } from "./sync";
import type { Snapshot } from "./types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = 100 * 24 * HOUR;
const limits = { hourlyLimit: 3, dailyLimit: 5 };

describe("unfollowQuota", () => {
  it("counts rolling hour and day windows", () => {
    const log = [now - 10 * MIN, now - 2 * HOUR, now - 25 * HOUR];
    expect(unfollowQuota(log, now, limits)).toEqual({
      lastHour: 1,
      lastDay: 2,
      limited: false,
      nextSlotAt: null,
    });
  });

  it("limits on the hourly window and frees a slot when the oldest leaves it", () => {
    const log = [now - 50 * MIN, now - 20 * MIN, now - 5 * MIN];
    const q = unfollowQuota(log, now, limits);
    expect(q.limited).toBe(true);
    expect(q.nextSlotAt).toBe(now - 50 * MIN + HOUR);
  });

  it("limits on the daily window", () => {
    const log = [20, 15, 10, 8, 6].map((h) => now - h * HOUR);
    const q = unfollowQuota(log, now, limits);
    expect(q.limited).toBe(true);
    expect(q.nextSlotAt).toBe(now - 20 * HOUR + 24 * HOUR);
  });

  it("prunes entries older than a day", () => {
    expect(pruneLog([now - 25 * HOUR, now - HOUR], now)).toEqual([now - HOUR]);
  });
});

describe("canSync", () => {
  const settings = { syncCooldownHours: 12, maxDelayMs: 7000 };
  const snapshot = (syncedAt: number): Snapshot => ({
    viewerId: "1",
    syncedAt,
    following: [],
    followerIds: [],
  });
  const base = {
    now,
    viewerId: "1",
    snapshot: null,
    job: null,
    lockUntil: 0,
    settings,
  };

  it("allows the first sync", () => {
    expect(canSync(base)).toEqual({ ok: true, resume: false });
  });

  it("enforces the cooldown after a complete sync", () => {
    expect(canSync({ ...base, snapshot: snapshot(now - 2 * HOUR) })).toEqual({
      ok: false,
      reason: "cooldown",
      until: now + 10 * HOUR,
    });
    expect(canSync({ ...base, snapshot: snapshot(now - 13 * HOUR) })).toEqual({
      ok: true,
      resume: false,
    });
  });

  it("does not apply the cooldown to another account", () => {
    expect(
      canSync({ ...base, viewerId: "2", snapshot: snapshot(now - HOUR) }).ok,
    ).toBe(true);
  });

  it("blocks everything while locked", () => {
    expect(canSync({ ...base, lockUntil: now + HOUR })).toEqual({
      ok: false,
      reason: "locked",
      until: now + HOUR,
    });
  });

  it("resumes a paused job, skipping the cooldown", () => {
    const job = { ...newJob("1", now - HOUR), status: "paused" as const };
    expect(canSync({ ...base, snapshot: snapshot(now - HOUR), job })).toEqual({
      ok: true,
      resume: true,
    });
  });

  it("refuses while a job is running, unless its heartbeat is stale", () => {
    const job = { ...newJob("1", now), updatedAt: now - 10_000 };
    expect(canSync({ ...base, job }).ok).toBe(false);
    expect(
      canSync({ ...base, job: { ...job, updatedAt: now - 2 * MIN } }),
    ).toEqual({ ok: true, resume: true });
  });
});

describe("randomDelay", () => {
  it("stays within bounds", () => {
    expect(randomDelay(3000, 7000, () => 0)).toBe(3000);
    expect(randomDelay(3000, 7000, () => 0.999999)).toBe(7000);
  });
});
