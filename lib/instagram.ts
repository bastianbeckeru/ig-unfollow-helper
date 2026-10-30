import type { Account, SyncPhase } from "./types";

// Public app id the Instagram web client sends with every API call.
const IG_APP_ID = "936619743392459";
const PAGE_SIZE = 50;
const REQUEST_TIMEOUT_MS = 30_000;

export type Failure = {
  kind: "blocked" | "logged_out" | "error";
  message: string;
};
export type PageResult =
  | { kind: "ok"; users: Account[]; nextCursor: string | null }
  | Failure;
export type UnfollowResult = { kind: "ok" } | Failure;

const BLOCK_MESSAGES = [
  "checkpoint_required",
  "challenge_required",
  "feedback_required",
  "wait a few minutes",
];

/** Why an Instagram API response is not a success, or null if it is. */
function failure(status: number, b: Record<string, unknown>): Failure | null {
  const message = typeof b.message === "string" ? b.message : "";
  const lower = message.toLowerCase();
  const fail = (kind: Failure["kind"]): Failure => ({
    kind,
    message: message || `HTTP ${status}`,
  });

  if (
    status === 429 ||
    b.spam === true ||
    BLOCK_MESSAGES.some((m) => lower.includes(m))
  )
    return fail("blocked");
  if (
    status === 401 ||
    lower.includes("login_required") ||
    b.require_login === true
  )
    return fail("logged_out");
  if (status < 200 || status >= 300 || b.status !== "ok") return fail("error");
  return null;
}

/** Maps a following/followers response to a page or a reason to stop. Pure, for testing. */
export function parsePage(status: number, body: unknown): PageResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const f = failure(status, b);
  if (f) return f;
  if (!Array.isArray(b.users))
    return { kind: "error", message: "Unexpected response" };

  const users = (b.users as Record<string, unknown>[])
    .map(toAccount)
    .filter((a) => a.id && a.username);
  const next = b.next_max_id;
  const nextCursor =
    typeof next === "string" && next
      ? next
      : typeof next === "number"
        ? String(next)
        : null;
  return { kind: "ok", users, nextCursor };
}

/** Maps the response to the unfollow mutation. Pure, for testing. */
export function parseUnfollow(status: number, body: unknown): UnfollowResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const data = b.data as
    | {
        xdt_destroy_friendship?: {
          friendship_status?: { following?: boolean };
        };
      }
    | undefined;
  const following = data?.xdt_destroy_friendship?.friendship_status?.following;
  if (status >= 200 && status < 300 && following === false)
    return { kind: "ok" };

  // GraphQL reports problems in errors[] or errorSummary rather than in message.
  const errors = Array.isArray(b.errors)
    ? (b.errors as { message?: string }[]).map((e) => e.message).join("; ")
    : "";
  const message = [b.message, errors, b.errorSummary, b.errorDescription]
    .filter((m) => typeof m === "string" && m)
    .join(" · ");
  const f = failure(status, { ...b, message, status: "fail" });
  if (f && f.kind !== "error") return f;
  if (following === true)
    return { kind: "error", message: "Instagram still shows you following" };
  return { kind: "error", message: message || `HTTP ${status}` };
}

function toAccount(u: Record<string, unknown>): Account {
  return {
    id: String(u.pk ?? u.pk_id ?? u.id ?? ""),
    username: String(u.username ?? ""),
    fullName: String(u.full_name ?? ""),
    isPrivate: u.is_private === true,
    isVerified: u.is_verified === true,
    picUrl: String(u.profile_pic_url ?? ""),
  };
}

/** What the Console tab shows about each request the extension sends. */
export type RequestTrace = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  status?: number;
  finalUrl?: string;
  contentType?: string;
  response?: string;
  error?: string;
};

let traceHook: ((t: RequestTrace) => void) | null = null;

export function onRequest(hook: (t: RequestTrace) => void): void {
  traceHook = hook;
}

/** Same-origin call with the user's session, the way the Instagram web client makes it. */
async function request(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown } | Failure> {
  const headers: Record<string, string> = {
    "X-IG-App-ID": IG_APP_ID,
    "X-Requested-With": "XMLHttpRequest",
    ...(init.headers as Record<string, string> | undefined),
  };
  const trace: RequestTrace = {
    method: init.method ?? "GET",
    url,
    headers,
    body: init.body?.toString(),
  };
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      credentials: "include",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    traceHook?.({ ...trace, error: message });
    return { kind: "error", message };
  }
  const text = await res.text().catch(() => "");
  traceHook?.({
    ...trace,
    status: res.status,
    finalUrl: res.redirected ? res.url : undefined,
    contentType: res.headers.get("content-type") ?? "",
    response: text,
  });
  return { status: res.status, body: parseBody(text) };
}

/**
 * Instagram sometimes prefixes JSON with `for (;;);` against JSON hijacking. A body that
 * still isn't JSON becomes a message with its first characters, so the error says what came back.
 */
export function parseBody(text: string): unknown {
  const json = text.replace(/^\s*for\s*\(;;\);/, "");
  try {
    return JSON.parse(json);
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
    return {
      message: snippet ? `Unexpected response: ${snippet}` : "Empty response",
    };
  }
}

/** Fetches one page of the viewer's following or followers list. */
export async function fetchPage(
  phase: SyncPhase,
  viewerId: string,
  cursor: string | null,
): Promise<PageResult> {
  const params = new URLSearchParams({ count: String(PAGE_SIZE) });
  if (cursor) params.set("max_id", cursor);
  if (phase === "followers") params.set("search_surface", "follow_list_page");
  const res = await request(
    `/api/v1/friendships/${viewerId}/${phase}/?${params}`,
  );
  return "kind" in res ? res : parsePage(res.status, res.body);
}

/** The unfollow mutation's id, as of when this was written. Instagram changes it on deploys. */
export const DEFAULT_UNFOLLOW_DOC_ID = "27789106940691111";

export type SessionTokens = {
  csrf: string;
  dtsg: string;
  lsd: string;
};

/**
 * The tokens Instagram's web client signs GraphQL mutations with. They're embedded in the
 * page's HTML. Pure, for testing.
 */
export function tokensFromHtml(
  html: string,
): { dtsg: string; lsd: string } | null {
  const dtsg =
    html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ??
    html.match(/"dtsg":\{"token":"([^"]+)"/)?.[1];
  const lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"/)?.[1];
  return dtsg && lsd ? { dtsg, lsd } : null;
}

/** Facebook's checksum of fb_dtsg, sent alongside it. */
export function jazoest(dtsg: string): string {
  let sum = 0;
  for (const ch of dtsg) sum += ch.charCodeAt(0);
  return `2${sum}`;
}

/**
 * Unfollows one account with the same GraphQL mutation Instagram's own Unfollow button
 * sends (usePolarisUnfollowMutation). The REST endpoints answer web sessions with HTML.
 */
export async function unfollow(
  userId: string,
  tokens: SessionTokens,
  docId: string,
): Promise<UnfollowResult> {
  const friendlyName = "usePolarisUnfollowMutation";
  const res = await request("/api/graphql", {
    method: "POST",
    headers: {
      "X-CSRFToken": tokens.csrf,
      "X-FB-LSD": tokens.lsd,
      "X-FB-Friendly-Name": friendlyName,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      __d: "www",
      __user: "0",
      __a: "1",
      __comet_req: "7",
      fb_dtsg: tokens.dtsg,
      jazoest: jazoest(tokens.dtsg),
      lsd: tokens.lsd,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: friendlyName,
      server_timestamps: "true",
      variables: JSON.stringify({
        target_user_id: userId,
        container_module: "profile",
      }),
      doc_id: docId,
    }),
  });
  if ("kind" in res) return res;
  const result = parseUnfollow(res.status, res.body);
  // A 200 we can't read may still have worked: ask Instagram where things stand.
  if (
    result.kind === "error" &&
    res.status === 200 &&
    (await isFollowing(userId)) === false
  )
    return { kind: "ok" };
  return result;
}

/** Whether you follow the account, or null if Instagram didn't say. */
async function isFollowing(userId: string): Promise<boolean | null> {
  const res = await request(`/api/v1/friendships/show/${userId}/`);
  if ("kind" in res) return null;
  const following = (res.body as Record<string, unknown> | null)?.following;
  return typeof following === "boolean" ? following : null;
}

/** The logged-in account id, from the session cookie Instagram exposes to the page. */
export function viewerIdFromCookie(cookie: string): string | null {
  const m = cookie.match(/(?:^|;\s*)ds_user_id=(\d+)/);
  return m?.[1] ?? null;
}

/** The CSRF token Instagram requires on POST requests. */
export function csrfFromCookie(cookie: string): string | null {
  return cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] ?? null;
}

/**
 * Recognizes the request the Instagram web client sends when you press Unfollow or Follow,
 * and returns the target user id. Covers the REST endpoints and the GraphQL mutations.
 */
export function matchFriendshipRequest(
  url: string,
  body: string | null,
): { kind: "unfollow" | "follow"; userId: string; docId?: string } | null {
  const rest = url.match(
    /\/(?:api\/v1\/)?(?:web\/)?friendships\/(?:(destroy|create)\/(\d+)|(\d+)\/(unfollow|follow))(?:[/?]|$)/,
  );
  if (rest) {
    const action = rest[1] ?? rest[4];
    const userId = rest[2] ?? rest[3] ?? "";
    return {
      kind:
        action === "destroy" || action === "unfollow" ? "unfollow" : "follow",
      userId,
    };
  }
  if (!url.includes("/graphql") || !body) return null;
  const params = new URLSearchParams(body);
  const name = params.get("fb_api_req_friendly_name") ?? "";
  const kind = /unfollow/i.test(name)
    ? "unfollow"
    : /follow/i.test(name)
      ? "follow"
      : null;
  if (!kind) return null;
  try {
    const vars = JSON.parse(params.get("variables") ?? "{}") as Record<
      string,
      unknown
    >;
    const userId = vars.target_user_id ?? vars.user_id ?? vars.target_id;
    const docId = params.get("doc_id") ?? undefined;
    return userId
      ? { kind, userId: String(userId), ...(docId && { docId }) }
      : null;
  } catch {
    return null;
  }
}
