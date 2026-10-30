import type { PageResult } from "./instagram";
import { randomDelay } from "./pacing";
import type { Settings, Snapshot, SyncJob, SyncPhase } from "./types";

export type SyncDeps = {
  fetchPage(
    phase: SyncPhase,
    viewerId: string,
    cursor: string | null,
  ): Promise<PageResult>;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** Reads the stored job, to see whether the user asked to stop. */
  loadJob(): Promise<SyncJob | null>;
  saveJob(job: SyncJob): Promise<void>;
  /** Replaces the snapshot and clears the job. */
  complete(snapshot: Snapshot): Promise<void>;
  lock(until: number): Promise<void>;
  settings: Pick<
    Settings,
    "minDelayMs" | "maxDelayMs" | "maxAccountsPerSync" | "blockLockoutHours"
  >;
  rand?: () => number;
};

export type SyncOutcome =
  | { kind: "done"; snapshot: Snapshot }
  | { kind: "paused"; job: SyncJob };

export function newJob(viewerId: string, now: number): SyncJob {
  return {
    viewerId,
    status: "running",
    phase: "following",
    cursor: null,
    following: [],
    followerIds: [],
    startedAt: now,
    updatedAt: now,
    stopRequested: false,
  };
}

/**
 * Pages through following, then followers, one request at a time with a random pause between
 * pages. Stops at the first sign of trouble and keeps the cursor, so the next run resumes.
 * A partial job never replaces the snapshot: a half-fetched followers list would flag
 * people who do follow you back.
 */
export async function runSync(
  deps: SyncDeps,
  start: SyncJob,
): Promise<SyncOutcome> {
  const { settings } = deps;
  let job: SyncJob = {
    ...start,
    status: "running",
    stopRequested: false,
    stopReason: undefined,
    message: undefined,
  };
  let fetchedThisRun = 0;
  await deps.saveJob(job);

  const pause = async (
    stopReason: SyncJob["stopReason"],
    message?: string,
  ): Promise<SyncOutcome> => {
    job = {
      ...job,
      status: "paused",
      stopReason,
      message,
      stopRequested: false,
      updatedAt: deps.now(),
    };
    await deps.saveJob(job);
    return { kind: "paused", job };
  };
  const stopRequested = async () =>
    (await deps.loadJob())?.stopRequested === true;

  for (;;) {
    if (await stopRequested()) return pause("stopped");

    const res = await deps.fetchPage(job.phase, job.viewerId, job.cursor);
    if (res.kind !== "ok") {
      if (res.kind === "blocked")
        await deps.lock(deps.now() + settings.blockLockoutHours * 3_600_000);
      return pause(res.kind, res.message);
    }

    fetchedThisRun += res.users.length;
    job =
      job.phase === "following"
        ? { ...job, following: [...job.following, ...res.users] }
        : {
            ...job,
            followerIds: [...job.followerIds, ...res.users.map((u) => u.id)],
          };
    job = { ...job, cursor: res.nextCursor, updatedAt: deps.now() };

    if (!res.nextCursor) {
      if (job.phase === "following") {
        job = { ...job, phase: "followers", cursor: null };
      } else {
        const snapshot = toSnapshot(job, deps.now());
        await deps.complete(snapshot);
        return { kind: "done", snapshot };
      }
    }

    if (await stopRequested()) return pause("stopped");
    await deps.saveJob(job);
    if (fetchedThisRun >= settings.maxAccountsPerSync) return pause("cap");

    await deps.sleep(
      randomDelay(settings.minDelayMs, settings.maxDelayMs, deps.rand),
    );
  }
}

function toSnapshot(job: SyncJob, now: number): Snapshot {
  const seen = new Set<string>();
  const following = job.following.filter(
    (a) => !seen.has(a.id) && seen.add(a.id),
  );
  return {
    viewerId: job.viewerId,
    syncedAt: now,
    following,
    followerIds: [...new Set(job.followerIds)],
  };
}
