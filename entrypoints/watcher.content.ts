import {
  headersToRecord,
  isFriendshipRequest,
  redactBody,
  redactHeaders,
  snippet,
} from "@/lib/debug";
import { matchFriendshipRequest } from "@/lib/instagram";

type Seen = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  status: number;
  response: string;
};

/**
 * Runs in the page's own JS world to see the requests Instagram sends when you press
 * Unfollow or Follow. It only observes: requests pass through unchanged. Successful ones
 * are posted to the isolated content script (instagram.content.ts), which stores them.
 * Every follow-related POST is also logged in full for the Console tab.
 */
export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    const post = (data: object) =>
      window.postMessage(
        { source: "ig-unfollow-helper", ...data },
        location.origin,
      );

    const report = (seen: Seen) => {
      // GETs (friendship lookups on every profile view) would drown the log; actions are POSTs.
      if (
        seen.method.toUpperCase() === "GET" ||
        !isFriendshipRequest(seen.url, seen.body, seen.headers)
      )
        return;
      const ok = seen.status >= 200 && seen.status < 300;
      const match = matchFriendshipRequest(seen.url, seen.body);
      if (ok && match) post(match);
      post({
        kind: "log",
        entry: {
          source: "instagram",
          level: ok ? "info" : "error",
          text: `${seen.method} ${seen.url} → ${seen.status}${match ? ` (detected ${match.kind} ${match.userId})` : " (not recognized)"}`,
          detail: [
            `Request headers: ${JSON.stringify(redactHeaders(seen.headers))}`,
            seen.body && `Request body: ${redactBody(seen.body)}`,
            `Response: ${snippet(seen.response, 1500)}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });
    };
    const safely = (fn: () => void) => {
      try {
        fn();
      } catch {
        // Never break the page.
      }
    };

    const originalFetch = window.fetch;
    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) {
      const res = await originalFetch.call(this, input, init);
      safely(() => {
        const url = input instanceof Request ? input.url : String(input);
        const body = bodyToString(init?.body);
        const headers = headersToRecord(
          init?.headers ??
            (input instanceof Request ? input.headers : undefined),
        );
        if (!isFriendshipRequest(url, body, headers)) return;
        const method =
          init?.method ?? (input instanceof Request ? input.method : "GET");
        res
          .clone()
          .text()
          .then((response) =>
            safely(() =>
              report({
                method,
                url,
                headers,
                body,
                status: res.status,
                response,
              }),
            ),
          )
          .catch(() => {});
      });
      return res;
    };

    const proto = XMLHttpRequest.prototype;
    const { open, send, setRequestHeader } = proto;
    const meta = new WeakMap<
      XMLHttpRequest,
      { method: string; url: string; headers: Record<string, string> }
    >();
    proto.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      meta.set(this, {
        method: String(args[0]),
        url: String(args[1]),
        headers: {},
      });
      return (open as (...a: unknown[]) => void).apply(this, args);
    } as typeof proto.open;
    proto.setRequestHeader = function (
      this: XMLHttpRequest,
      name: string,
      value: string,
    ) {
      const m = meta.get(this);
      if (m) m.headers[name] = value;
      return setRequestHeader.call(this, name, value);
    };
    proto.send = function (
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      this.addEventListener("load", () =>
        safely(() => {
          const m = meta.get(this);
          if (!m) return;
          const response =
            this.responseType === "" || this.responseType === "text"
              ? this.responseText
              : `[${this.responseType}]`;
          report({
            ...m,
            body: bodyToString(body),
            status: this.status,
            response,
          });
        }),
      );
      return send.call(this, body);
    };
  },
});

function bodyToString(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof FormData) {
    const params = new URLSearchParams();
    body.forEach((v, k) => {
      if (typeof v === "string") params.append(k, v);
    });
    return params.toString();
  }
  return null;
}
