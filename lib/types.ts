export type Account = {
  id: string;
  username: string;
  fullName: string;
  isPrivate: boolean;
  isVerified: boolean;
  picUrl: string;
};

/** Last complete sync. Followers are stored as ids only: that's all the diff needs. */
export type Snapshot = {
  viewerId: string;
  syncedAt: number;
  following: Account[];
  followerIds: string[];
};

export type SyncPhase = "following" | "followers";

export type SyncStopReason =
  | "stopped" // the user pressed Stop
  | "cap" // hit maxAccountsPerSync in this run
  | "blocked" // Instagram rate limit, checkpoint or challenge
  | "logged_out"
  | "error"
  | "interrupted"; // the Instagram tab reloaded or closed mid-sync

/** An in-progress or paused sync. Kept across runs so a sync can resume from its cursor. */
export type SyncJob = {
  viewerId: string;
  status: "running" | "paused";
  phase: SyncPhase;
  cursor: string | null;
  following: Account[];
  followerIds: string[];
  startedAt: number;
  updatedAt: number;
  stopRequested: boolean;
  stopReason?: SyncStopReason;
  message?: string;
};

export type Language = "en" | "es";

export type Settings = {
  language: Language;
  minDelayMs: number;
  maxDelayMs: number;
  maxAccountsPerSync: number;
  syncCooldownHours: number;
  blockLockoutHours: number;
  hourlyLimit: number;
  dailyLimit: number;
  hideVerified: boolean;
  hidePrivate: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  minDelayMs: 3000,
  maxDelayMs: 7000,
  maxAccountsPerSync: 10000,
  syncCooldownHours: 12,
  blockLockoutHours: 24,
  hourlyLimit: 30,
  dailyLimit: 120,
  hideVerified: true,
  hidePrivate: false,
};

export type DoneEntry = {
  at: number;
  username?: string;
};

export type KeepEntry = {
  username: string;
};

export type LogEntry = {
  at: number;
  /** sync and unfollow: requests the extension sends. instagram: requests the page itself sends. */
  source: "sync" | "unfollow" | "instagram";
  level: "info" | "error";
  text: string;
  detail?: string;
};
