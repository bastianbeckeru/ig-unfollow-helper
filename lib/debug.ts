/** Helpers for the Console tab: what gets logged about a request, minus the secrets. */

const SECRET_HEADERS = [
  "x-csrftoken",
  "x-ig-www-claim",
  "x-fb-lsd",
  "cookie",
  "authorization",
];
const SECRET_PARAMS = ["fb_dtsg", "jazoest", "lsd", "csrftoken"];

export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [
      k,
      SECRET_HEADERS.includes(k.toLowerCase()) ? "[redacted]" : v,
    ]),
  );
}

/** Redacts tokens in a form-encoded body; other bodies pass through. */
export function redactBody(body: string): string {
  if (!body.includes("=")) return body;
  const params = new URLSearchParams(body);
  for (const k of SECRET_PARAMS) if (params.has(k)) params.set(k, "[redacted]");
  return decodeURIComponent(params.toString());
}

export function snippet(text: string, max = 500): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * Whether a request the page sends is about following someone, worth logging. GraphQL
 * mutations carry their name in the body or in the X-FB-Friendly-Name header.
 */
export function isFriendshipRequest(
  url: string,
  body: string | null,
  headers: Record<string, string> = {},
): boolean {
  if (/friendships?|follow/i.test(url)) return true;
  if (!url.includes("/graphql")) return false;
  const header =
    Object.entries(headers).find(
      ([k]) => k.toLowerCase() === "x-fb-friendly-name",
    )?.[1] ?? "";
  const name =
    (body && new URLSearchParams(body).get("fb_api_req_friendly_name")) ||
    header;
  return /follow|friendship/i.test(name);
}

export function headersToRecord(
  h: HeadersInit | undefined,
): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return { ...h };
}
