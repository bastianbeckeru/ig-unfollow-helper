import { describe, expect, it } from "vitest";
import { candidates, nonFollowerCount } from "./candidates";
import type { Account, Snapshot } from "./types";

const acc = (id: string, extra: Partial<Account> = {}): Account => ({
  id,
  username: `user${id}`,
  fullName: `Name ${id}`,
  isPrivate: false,
  isVerified: false,
  picUrl: "",
  ...extra,
});

const snapshot: Snapshot = {
  viewerId: "1",
  syncedAt: 0,
  following: [
    acc("a"),
    acc("b"),
    acc("c", { isVerified: true }),
    acc("d", { isPrivate: true }),
    acc("e"),
  ],
  followerIds: ["b", "z"],
};

const none = {
  keep: {},
  done: {},
  settings: { hideVerified: false, hidePrivate: false },
};
const ids = (list: Account[]) => list.map((a) => a.id);

describe("candidates", () => {
  it("lists accounts you follow that do not follow you back", () => {
    expect(ids(candidates(snapshot, none))).toEqual(["a", "c", "d", "e"]);
    expect(nonFollowerCount(snapshot)).toBe(4);
  });

  it("excludes kept and already unfollowed accounts", () => {
    const list = candidates(snapshot, {
      ...none,
      keep: { a: { username: "usera" } },
      done: { e: { at: 1 } },
    });
    expect(ids(list)).toEqual(["c", "d"]);
  });

  it("hides verified and private accounts when asked", () => {
    expect(
      ids(
        candidates(snapshot, {
          ...none,
          settings: { hideVerified: true, hidePrivate: false },
        }),
      ),
    ).toEqual(["a", "d", "e"]);
    expect(
      ids(
        candidates(snapshot, {
          ...none,
          settings: { hideVerified: false, hidePrivate: true },
        }),
      ),
    ).toEqual(["a", "c", "e"]);
  });

  it("searches username and full name, case-insensitive", () => {
    expect(ids(candidates(snapshot, { ...none, query: "USERA" }))).toEqual([
      "a",
    ]);
    expect(ids(candidates(snapshot, { ...none, query: "name e" }))).toEqual([
      "e",
    ]);
  });
});
