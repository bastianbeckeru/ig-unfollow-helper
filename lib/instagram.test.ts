import { describe, expect, it } from "vitest";
import {
  csrfFromCookie,
  jazoest,
  matchFriendshipRequest,
  parseBody,
  parsePage,
  parseUnfollow,
  tokensFromHtml,
  viewerIdFromCookie,
} from "./instagram";

describe("parsePage", () => {
  it("parses users and the next cursor", () => {
    const res = parsePage(200, {
      status: "ok",
      next_max_id: "50",
      users: [
        {
          pk: 42,
          username: "ana",
          full_name: "Ana",
          is_private: true,
          is_verified: false,
          profile_pic_url: "x",
        },
      ],
    });
    expect(res).toEqual({
      kind: "ok",
      nextCursor: "50",
      users: [
        {
          id: "42",
          username: "ana",
          fullName: "Ana",
          isPrivate: true,
          isVerified: false,
          picUrl: "x",
        },
      ],
    });
  });

  it("treats a missing cursor as the last page", () => {
    expect(parsePage(200, { status: "ok", users: [] })).toEqual({
      kind: "ok",
      users: [],
      nextCursor: null,
    });
  });

  it("flags rate limits, checkpoints and spam as blocked", () => {
    expect(parsePage(429, null).kind).toBe("blocked");
    expect(
      parsePage(400, {
        status: "fail",
        message: "Please wait a few minutes before you try again.",
      }).kind,
    ).toBe("blocked");
    expect(
      parsePage(400, { status: "fail", message: "checkpoint_required" }).kind,
    ).toBe("blocked");
    expect(parsePage(400, { status: "fail", spam: true }).kind).toBe("blocked");
  });

  it("flags a lost session as logged out", () => {
    expect(parsePage(401, null).kind).toBe("logged_out");
    expect(
      parsePage(400, { status: "fail", message: "login_required" }).kind,
    ).toBe("logged_out");
  });

  it("reports other failures as errors", () => {
    expect(parsePage(500, null).kind).toBe("error");
    expect(parsePage(200, null).kind).toBe("error");
  });
});

describe("parseUnfollow", () => {
  const response = (following: boolean) => ({
    data: {
      xdt_destroy_friendship: {
        username: "ana",
        friendship_status: { following },
        id: "1",
      },
    },
  });

  it("accepts the mutation result", () => {
    expect(parseUnfollow(200, response(false))).toEqual({ kind: "ok" });
  });

  it("rejects a result that still shows you following", () => {
    expect(parseUnfollow(200, response(true))).toEqual({
      kind: "error",
      message: "Instagram still shows you following",
    });
  });

  it("flags action blocks and rate limits", () => {
    expect(
      parseUnfollow(200, { errors: [{ message: "feedback_required" }] }).kind,
    ).toBe("blocked");
    expect(parseUnfollow(429, null).kind).toBe("blocked");
  });

  it("reports GraphQL errors", () => {
    expect(
      parseUnfollow(200, { errors: [{ message: "Invalid doc id" }] }),
    ).toEqual({ kind: "error", message: "Invalid doc id" });
  });
});

describe("session tokens", () => {
  it("reads fb_dtsg and lsd from the page", () => {
    const html =
      '<script>["DTSGInitialData",[],{"token":"NAf-abc:1"},258],["LSD",[],{"token":"f-Mo"},323]</script>';
    expect(tokensFromHtml(html)).toEqual({ dtsg: "NAf-abc:1", lsd: "f-Mo" });
    expect(tokensFromHtml("<html></html>")).toBeNull();
  });

  it("computes jazoest", () => {
    expect(jazoest("AB")).toBe(`2${65 + 66}`);
  });
});

describe("parseBody", () => {
  it("strips the anti-hijacking prefix", () => {
    expect(parseBody('for (;;);{"status":"ok"}')).toEqual({ status: "ok" });
  });

  it("turns a non-JSON body into a readable message", () => {
    expect(parseBody("<!DOCTYPE html><html>")).toEqual({
      message: "Unexpected response: <!DOCTYPE html><html>",
    });
    expect(parseBody("")).toEqual({ message: "Empty response" });
  });

  it("surfaces that message as an error", () => {
    expect(parseUnfollow(200, parseBody("<html>"))).toEqual({
      kind: "error",
      message: "Unexpected response: <html>",
    });
  });
});

describe("cookies", () => {
  const cookie = "csrftoken=abc123; ds_user_id=123456; mid=x";
  it("reads the viewer id and CSRF token", () => {
    expect(viewerIdFromCookie(cookie)).toBe("123456");
    expect(csrfFromCookie(cookie)).toBe("abc123");
    expect(viewerIdFromCookie("mid=x")).toBeNull();
    expect(csrfFromCookie("mid=x")).toBeNull();
  });
});

describe("matchFriendshipRequest", () => {
  it("matches the REST endpoints", () => {
    expect(
      matchFriendshipRequest(
        "https://www.instagram.com/api/v1/friendships/destroy/123/",
        null,
      ),
    ).toEqual({
      kind: "unfollow",
      userId: "123",
    });
    expect(
      matchFriendshipRequest("/api/v1/friendships/create/123/", null),
    ).toEqual({ kind: "follow", userId: "123" });
    expect(
      matchFriendshipRequest("/web/friendships/123/unfollow/", null),
    ).toEqual({ kind: "unfollow", userId: "123" });
  });

  it("matches GraphQL mutations by friendly name, with their doc id", () => {
    const body = new URLSearchParams({
      fb_api_req_friendly_name: "usePolarisUnfollowMutation",
      variables: JSON.stringify({ target_user_id: "777" }),
      doc_id: "42",
    }).toString();
    expect(matchFriendshipRequest("/api/graphql", body)).toEqual({
      kind: "unfollow",
      userId: "777",
      docId: "42",
    });
  });

  it("ignores unrelated requests", () => {
    expect(
      matchFriendshipRequest(
        "/api/v1/friendships/123/following/?count=50",
        null,
      ),
    ).toBeNull();
    expect(
      matchFriendshipRequest("/api/v1/friendships/show/123/", null),
    ).toBeNull();
    expect(
      matchFriendshipRequest(
        "/api/graphql",
        "fb_api_req_friendly_name=PolarisFeedQuery",
      ),
    ).toBeNull();
  });
});
