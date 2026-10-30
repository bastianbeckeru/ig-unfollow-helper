import { redactBody, redactHeaders, snippet } from "@/lib/debug";
import {
  csrfFromCookie,
  DEFAULT_UNFOLLOW_DOC_ID,
  fetchPage,
  onRequest,
  type RequestTrace,
  tokensFromHtml,
  type UnfollowResult,
  unfollow,
  viewerIdFromCookie,
} from "@/lib/instagram";
import { canSync, type SyncGate } from "@/lib/pacing";
import { addLog, get, recordFollow, recordUnfollow, set } from "@/lib/store";
import { newJob, runSync } from "@/lib/sync";
import type { LogEntry } from "@/lib/types";

export type ContentRequest =
  | { type: "viewer" }
  | { type: "sync:start" }
  | { type: "unfollow"; userId: string };
export type ViewerResponse = { viewerId: string | null };
type SyncRefusal =
  | Extract<SyncGate, { ok: false }>
  | { ok: false; reason: "logged_out"; until: null };
export type SyncStartResponse =
  | { started: true; resume: boolean }
  | { started: false; gate: SyncRefusal };

/**
 * Runs on instagram.com in the extension's isolated world. It stores the unfollows the
 * watcher sees, and runs syncs and one-click unfollows with the user's session when the
 * side panel asks.
 */
export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  main() {
    onRequest(logTrace);

    window.addEventListener("message", (e) => {
      if (e.source !== window || e.data?.source !== "ig-unfollow-helper")
        return;
      const data = e.data as {
        kind: string;
        userId?: string;
        docId?: string;
        entry?: Omit<LogEntry, "at">;
      };
      if (data.kind === "unfollow" && data.userId)
        recordUnfollow(data.userId, Date.now());
      if (data.kind === "unfollow" && data.docId)
        set("unfollowDocId", data.docId);
      if (data.kind === "follow" && data.userId) recordFollow(data.userId);
      if (data.kind === "log" && data.entry) addLog(data.entry);
    });

    browser.runtime.onMessage.addListener(
      (msg: ContentRequest, _sender, sendResponse) => {
        if (msg.type === "viewer") {
          sendResponse({
            viewerId: viewerIdFromCookie(document.cookie),
          } satisfies ViewerResponse);
          return;
        }
        if (msg.type === "sync:start") {
          startSync().then(sendResponse);
          return true; // async response
        }
        if (msg.type === "unfollow") {
          unfollowAccount(msg.userId).then(sendResponse);
          return true;
        }
      },
    );
  },
});

let running = false;

async function startSync(): Promise<SyncStartResponse> {
  const viewerId = viewerIdFromCookie(document.cookie);
  if (!viewerId)
    return {
      started: false,
      gate: { ok: false, reason: "logged_out", until: null },
    };
  if (running)
    return {
      started: false,
      gate: { ok: false, reason: "running", until: null },
    };

  const [settings, snapshot, job, lockUntil] = await Promise.all([
    get("settings"),
    get("snapshot"),
    get("syncJob"),
    get("lockUntil"),
  ]);
  const gate = canSync({
    now: Date.now(),
    viewerId,
    snapshot,
    job,
    lockUntil,
    settings,
  });
  if (!gate.ok) return { started: false, gate };

  const start = gate.resume && job ? job : newJob(viewerId, Date.now());
  running = true;
  addLog({
    source: "sync",
    level: "info",
    text: gate.resume ? `Sync resumed (${start.phase})` : "Sync started",
  });
  runSync(
    {
      fetchPage,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: Date.now,
      loadJob: () => get("syncJob"),
      saveJob: (j) => set("syncJob", j),
      complete: (s) =>
        browser.storage.local.set({ snapshot: s, syncJob: null }),
      lock: (until) => set("lockUntil", until),
      settings,
    },
    start,
  )
    .then((out) =>
      addLog(
        out.kind === "done"
          ? {
              source: "sync",
              level: "info",
              text: `Sync done: ${out.snapshot.following.length} following, ${out.snapshot.followerIds.length} followers`,
            }
          : {
              source: "sync",
              level:
                out.job.stopReason === "stopped" || out.job.stopReason === "cap"
                  ? "info"
                  : "error",
              text: `Sync paused: ${out.job.stopReason}${out.job.message ? ` (${out.job.message})` : ""}`,
            },
      ),
    )
    .catch(async (e) => {
      const message = e instanceof Error ? e.message : String(e);
      addLog({
        source: "sync",
        level: "error",
        text: `Sync crashed: ${message}`,
      });
      const current = await get("syncJob");
      if (current)
        await set("syncJob", {
          ...current,
          status: "paused",
          stopReason: "error",
          message,
        });
    })
    .finally(() => {
      running = false;
    });
  return { started: true, resume: gate.resume };
}

/**
 * One unfollow per click in the side panel. Its own requests don't go through the page,
 * so the watcher doesn't see them: it records the unfollow itself. A block locks syncs
 * and unfollows alike.
 */
async function unfollowAccount(userId: string): Promise<UnfollowResult> {
  const csrf = csrfFromCookie(document.cookie);
  if (!csrf || !viewerIdFromCookie(document.cookie))
    return { kind: "logged_out", message: "Not logged in" };
  const pageTokens = tokensFromHtml(document.documentElement.innerHTML);
  if (!pageTokens) {
    const message =
      "Session tokens not found in the page. Reload the Instagram tab.";
    await addLog({ source: "unfollow", level: "error", text: message });
    return { kind: "error", message };
  }
  const docId = (await get("unfollowDocId")) ?? DEFAULT_UNFOLLOW_DOC_ID;
  const res = await unfollow(userId, { csrf, ...pageTokens }, docId);
  await addLog({
    source: "unfollow",
    level: res.kind === "ok" ? "info" : "error",
    text:
      res.kind === "ok"
        ? `Unfollowed ${userId}`
        : `Unfollow ${userId} failed: ${res.kind} (${res.message})`,
  });
  if (res.kind === "ok") await recordUnfollow(userId, Date.now());
  if (res.kind === "blocked") {
    const settings = await get("settings");
    await set("lockUntil", Date.now() + settings.blockLockoutHours * 3_600_000);
  }
  return res;
}

/** Logs every request the extension sends. Sync pages log briefly; anything else in full. */
function logTrace(t: RequestTrace) {
  const isSyncPage = /\/friendships\/\d+\/(following|followers)\//.test(t.url);
  const failed =
    !!t.error || (t.status ?? 0) >= 300 || !t.contentType?.includes("json");
  const head =
    `${t.method} ${t.url} → ${t.error ?? t.status} ${t.contentType ?? ""}`.trim();
  const detail = [
    t.finalUrl && `Redirected to: ${t.finalUrl}`,
    `Request headers: ${JSON.stringify(redactHeaders(t.headers))}`,
    t.body && `Request body: ${redactBody(t.body)}`,
    t.response !== undefined &&
      `Response: ${snippet(t.response, isSyncPage && !failed ? 200 : 1500)}`,
  ]
    .filter(Boolean)
    .join("\n");
  addLog({
    source: isSyncPage ? "sync" : "unfollow",
    level: failed ? "error" : "info",
    text: head,
    detail,
  });
}
