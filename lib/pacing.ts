import type { Settings, Snapshot, SyncJob } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type Quota = {
  lastHour: number;
  lastDay: number;
  /** True when either soft limit is reached. */
  limited: boolean;
  /** When the binding window frees a slot again; null if not limited. */
  nextSlotAt: number | null;
};

/** Rolling-window unfollow counts. `log` holds unfollow timestamps, any order. */
export function unfollowQuota(
  log: number[],
  now: number,
  s: Pick<Settings, "hourlyLimit" | "dailyLimit">,
): Quota {
  const inDay = log.filter((t) => now - t < DAY).sort((a, b) => a - b);
  const inHour = inDay.filter((t) => now - t < HOUR);
  let nextSlotAt: number | null = null;
  // Once a window is full, a slot frees up when its oldest counted unfollow ages out.
  const dayOldest = inDay.at(-s.dailyLimit);
  if (inDay.length >= s.dailyLimit && dayOldest !== undefined) {
    nextSlotAt = dayOldest + DAY;
  }
  const hourOldest = inHour.at(-s.hourlyLimit);
  if (inHour.length >= s.hourlyLimit && hourOldest !== undefined) {
    nextSlotAt = Math.max(nextSlotAt ?? 0, hourOldest + HOUR);
  }
  return {
    lastHour: inHour.length,
    lastDay: inDay.length,
    limited: nextSlotAt !== null,
    nextSlotAt,
  };
}

/** Drops entries older than the longest window so the log doesn't grow forever. */
export function pruneLog(log: number[], now: number): number[] {
  return log.filter((t) => now - t < DAY);
}

export type SyncGate =
  | { ok: true; resume: boolean }
  | {
      ok: false;
      reason: "locked" | "cooldown" | "running";
      until: number | null;
    };

/**
 * A "running" job whose heartbeat is older than the longest pause plus a request timeout
 * is dead: the Instagram tab reloaded or closed mid-sync.
 */
export function isStale(
  job: SyncJob,
  now: number,
  s: Pick<Settings, "maxDelayMs">,
): boolean {
  return (
    job.status === "running" && now - job.updatedAt > s.maxDelayMs + 60_000
  );
}

/**
 * Whether a sync may start now. A paused job for the same account resumes from its
 * cursor and skips the cooldown: it doesn't refetch anything already fetched.
 */
export function canSync(args: {
  now: number;
  viewerId: string;
  snapshot: Snapshot | null;
  job: SyncJob | null;
  lockUntil: number;
  settings: Pick<Settings, "syncCooldownHours" | "maxDelayMs">;
}): SyncGate {
  const { now, viewerId, snapshot, job, lockUntil, settings } = args;
  if (lockUntil > now) return { ok: false, reason: "locked", until: lockUntil };
  if (job && job.status === "running" && !isStale(job, now, settings)) {
    return { ok: false, reason: "running", until: null };
  }
  if (job && job.viewerId === viewerId) return { ok: true, resume: true };
  if (snapshot && snapshot.viewerId === viewerId) {
    const until = snapshot.syncedAt + settings.syncCooldownHours * HOUR;
    if (until > now) return { ok: false, reason: "cooldown", until };
  }
  return { ok: true, resume: false };
}

export function randomDelay(
  min: number,
  max: number,
  rand: () => number = Math.random,
): number {
  return Math.round(min + rand() * Math.max(0, max - min));
}
