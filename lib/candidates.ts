import type {
  Account,
  DoneEntry,
  KeepEntry,
  Settings,
  Snapshot,
} from "./types";

export type CandidateFilters = {
  keep: Record<string, KeepEntry>;
  done: Record<string, DoneEntry>;
  settings: Pick<Settings, "hideVerified" | "hidePrivate">;
  query?: string;
};

/** Accounts you follow that don't follow you back, minus kept, already unfollowed and filtered ones. */
export function candidates(snapshot: Snapshot, f: CandidateFilters): Account[] {
  const followers = new Set(snapshot.followerIds);
  const q = f.query?.trim().toLowerCase() ?? "";
  return snapshot.following.filter(
    (a) =>
      !followers.has(a.id) &&
      !f.keep[a.id] &&
      !f.done[a.id] &&
      !(f.settings.hideVerified && a.isVerified) &&
      !(f.settings.hidePrivate && a.isPrivate) &&
      (!q ||
        a.username.toLowerCase().includes(q) ||
        a.fullName.toLowerCase().includes(q)),
  );
}

export function nonFollowerCount(snapshot: Snapshot): number {
  const followers = new Set(snapshot.followerIds);
  return snapshot.following.filter((a) => !followers.has(a.id)).length;
}
