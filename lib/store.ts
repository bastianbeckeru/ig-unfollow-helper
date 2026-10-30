import { browser } from "wxt/browser";
import { pruneLog } from "./pacing";
import {
  DEFAULT_SETTINGS,
  type DoneEntry,
  type KeepEntry,
  type LogEntry,
  type Settings,
  type Snapshot,
  type SyncJob,
} from "./types";

/** Everything the extension stores, all in chrome.storage.local. */
export type State = {
  settings: Settings;
  snapshot: Snapshot | null;
  syncJob: SyncJob | null;
  lockUntil: number;
  keep: Record<string, KeepEntry>;
  done: Record<string, DoneEntry>;
  unfollowLog: number[];
  /** The Console tab, newest last. */
  log: LogEntry[];
  /** The unfollow mutation id, learned from the last unfollow Instagram itself sent. */
  unfollowDocId: string | null;
};

const DEFAULTS: State = {
  settings: DEFAULT_SETTINGS,
  snapshot: null,
  syncJob: null,
  lockUntil: 0,
  keep: {},
  done: {},
  unfollowLog: [],
  log: [],
  unfollowDocId: null,
};

const local = () => browser.storage.local;

export async function get<K extends keyof State>(key: K): Promise<State[K]> {
  const r = await local().get(key);
  const value = (r[key] ?? DEFAULTS[key]) as State[K];
  // Merge so settings added in later versions get their defaults.
  return (
    key === "settings" ? { ...DEFAULT_SETTINGS, ...(value as Settings) } : value
  ) as State[K];
}

export async function getAll(): Promise<State> {
  const r = (await local().get(null)) as Partial<State>;
  return {
    ...DEFAULTS,
    ...r,
    settings: { ...DEFAULT_SETTINGS, ...r.settings },
  };
}

export async function set<K extends keyof State>(
  key: K,
  value: State[K],
): Promise<void> {
  await local().set({ [key]: value });
}

export async function clearAll(): Promise<void> {
  await local().clear();
}

/** Records an unfollow you made on Instagram: marks the account done and counts it toward the limits. */
export async function recordUnfollow(
  userId: string,
  now: number,
): Promise<void> {
  const [done, log, snapshot] = await Promise.all([
    get("done"),
    get("unfollowLog"),
    get("snapshot"),
  ]);
  const username = snapshot?.following.find((a) => a.id === userId)?.username;
  await local().set({
    done: { ...done, [userId]: { at: now, username } },
    unfollowLog: [...pruneLog(log, now), now],
  });
}

/** A re-follow undoes the done mark. It stays in the log: Instagram counted the unfollow. */
export async function recordFollow(userId: string): Promise<void> {
  const done = await get("done");
  if (!done[userId]) return;
  const { [userId]: _, ...rest } = done;
  await set("done", rest);
}

const MAX_LOG = 300;
let logChain = Promise.resolve();

/** Appends to the Console log. Writes are queued so concurrent entries don't overwrite each other. */
export function addLog(entry: Omit<LogEntry, "at">): Promise<void> {
  logChain = logChain
    .then(async () => {
      const log = await get("log");
      await set("log", [...log, { at: Date.now(), ...entry }].slice(-MAX_LOG));
    })
    .catch(console.error);
  return logChain;
}
