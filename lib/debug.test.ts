import { describe, expect, it } from "vitest";
import {
  isFriendshipRequest,
  redactBody,
  redactHeaders,
  snippet,
} from "./debug";

describe("debug helpers", () => {
  it("redacts secret headers and body tokens", () => {
    expect(redactHeaders({ "X-CSRFToken": "abc", "X-IG-App-ID": "1" })).toEqual(
      { "X-CSRFToken": "[redacted]", "X-IG-App-ID": "1" },
    );
    expect(redactBody("fb_dtsg=secret&doc_id=42")).toBe(
      "fb_dtsg=[redacted]&doc_id=42",
    );
  });

  it("spots friendship requests", () => {
    expect(isFriendshipRequest("/api/v1/friendships/destroy/1/", null)).toBe(
      true,
    );
    expect(
      isFriendshipRequest(
        "/api/graphql",
        "fb_api_req_friendly_name=usePolarisFollowMutation",
      ),
    ).toBe(true);
    expect(
      isFriendshipRequest(
        "/api/graphql",
        "fb_api_req_friendly_name=PolarisFeedQuery",
      ),
    ).toBe(false);
    expect(
      isFriendshipRequest("/graphql/query", "doc_id=1", {
        "X-FB-Friendly-Name": "usePolarisUnfollowMutation",
      }),
    ).toBe(true);
  });

  it("flattens and truncates snippets", () => {
    expect(snippet("a\n  b", 10)).toBe("a b");
    expect(snippet("abcdef", 3)).toBe("abc…");
  });
});
