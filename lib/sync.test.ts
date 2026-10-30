import { describe, expect, it } from "vitest";
import type { PageResult } from "./instagram";
import { newJob, runSync, type SyncDeps } from "./sync";
import type { Account, Snapshot, SyncJob } from "./types";

const acc = (id: string): Account => ({
  id,
  username: id,
  fullName: "",
  isPrivate: false,
  isVerified: false,
  picUrl: "",
});
const ok = (ids: string[], nextCursor: string | null): PageResult => ({
  kind: "ok",
  users: ids.map(acc),
  nextCursor,
});

function harness(
  pages: PageResult[],
  overrides: Partial<SyncDeps["settings"]> = {},
) {
  const calls: { phase: string; cursor: string | null }[] = [];
  const sleeps: number[] = [];
  let stored: SyncJob | null = null;
  let snapshot: Snapshot | null = null;
  let lockedUntil = 0;
  let stopAfterCall = Infinity;
  const deps: SyncDeps = {
    fetchPage: async (phase, _viewer, cursor) => {
      calls.push({ phase, cursor });
      if (calls.length >= stopAfterCall && stored)
        stored = { ...stored, stopRequested: true };
      return pages.shift() ?? ok([], null);
    },
    sleep: async (ms) => void sleeps.push(ms),
    now: () => 1000,
    loadJob: async () => stored,
    saveJob: async (j) => {
      stored = j;
    },
    complete: async (s) => {
      snapshot = s;
      stored = null;
    },
    lock: async (until) => {
      lockedUntil = until;
    },
    settings: {
      minDelayMs: 3000,
      maxDelayMs: 7000,
      maxAccountsPerSync: 10_000,
      blockLockoutHours: 24,
      ...overrides,
    },
    rand: () => 0.5,
  };
  return {
    deps,
    calls,
    sleeps,
    stopAfter: (n: number) => (stopAfterCall = n),
    get stored() {
      return stored;
    },
    get snapshot() {
      return snapshot;
    },
    get lockedUntil() {
      return lockedUntil;
    },
  };
}

describe("runSync", () => {
  it("pages through following then followers and builds the snapshot", async () => {
    const h = harness([
      ok(["a", "b"], "c1"),
      ok(["c", "a"], null),
      ok(["b"], "f1"),
      ok(["x"], null),
    ]);
    const out = await runSync(h.deps, newJob("1", 0));

    expect(out.kind).toBe("done");
    expect(h.calls).toEqual([
      { phase: "following", cursor: null },
      { phase: "following", cursor: "c1" },
      { phase: "followers", cursor: null },
      { phase: "followers", cursor: "f1" },
    ]);
    expect(h.snapshot?.following.map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(h.snapshot?.followerIds).toEqual(["b", "x"]);
    expect(h.stored).toBeNull();
    expect(h.sleeps).toEqual([5000, 5000, 5000]);
  });

  it("stops on a block, locks, and keeps the partial job without touching the snapshot", async () => {
    const h = harness([
      ok(["a"], "c1"),
      { kind: "blocked", message: "Please wait a few minutes" },
    ]);
    const out = await runSync(h.deps, newJob("1", 0));

    expect(out.kind).toBe("paused");
    expect(h.snapshot).toBeNull();
    expect(h.lockedUntil).toBe(1000 + 24 * 3_600_000);
    expect(h.stored).toMatchObject({
      status: "paused",
      stopReason: "blocked",
      cursor: "c1",
      phase: "following",
    });
    expect(h.stored?.following.map((a) => a.id)).toEqual(["a"]);
  });

  it("does not lock on a plain error", async () => {
    const h = harness([{ kind: "error", message: "HTTP 500" }]);
    await runSync(h.deps, newJob("1", 0));
    expect(h.lockedUntil).toBe(0);
    expect(h.stored?.stopReason).toBe("error");
  });

  it("resumes from the stored cursor", async () => {
    const h = harness([ok(["y"], null)]);
    const paused: SyncJob = {
      ...newJob("1", 0),
      status: "paused",
      phase: "followers",
      cursor: "f9",
      following: [acc("a")],
      followerIds: ["x"],
    };
    await runSync(h.deps, paused);
    expect(h.calls).toEqual([{ phase: "followers", cursor: "f9" }]);
    expect(h.snapshot?.followerIds).toEqual(["x", "y"]);
  });

  it("pauses at the per-run cap", async () => {
    const h = harness([ok(["a", "b"], "c1"), ok(["c", "d"], "c2")], {
      maxAccountsPerSync: 3,
    });
    await runSync(h.deps, newJob("1", 0));
    expect(h.calls).toHaveLength(2);
    expect(h.stored).toMatchObject({
      status: "paused",
      stopReason: "cap",
      cursor: "c2",
    });
  });

  it("honors a stop request", async () => {
    const h = harness([ok(["a"], "c1"), ok(["b"], "c2")]);
    h.stopAfter(1);
    await runSync(h.deps, newJob("1", 0));
    expect(h.calls).toHaveLength(1);
    expect(h.stored).toMatchObject({
      status: "paused",
      stopReason: "stopped",
      stopRequested: false,
    });
  });
});
