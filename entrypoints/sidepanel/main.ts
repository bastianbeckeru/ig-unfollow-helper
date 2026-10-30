import "@fontsource-variable/inter";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  BookmarkX,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CirclePause,
  Copy,
  createElement,
  type IconNode,
  ListFilter,
  LoaderCircle,
  Lock,
  PlugZap,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  Square,
  Terminal,
  Timer,
  Trash2,
  Undo2,
  UserMinus,
  Users,
} from "lucide";
import { candidates, nonFollowerCount } from "@/lib/candidates";
import { type Key, locale, setLanguage, t } from "@/lib/i18n";
import type { UnfollowResult } from "@/lib/instagram";
import { canSync, isStale, unfollowQuota } from "@/lib/pacing";
import { clearAll, getAll, type State, set } from "@/lib/store";
import type { Account, Language, LogEntry, Settings } from "@/lib/types";
import type { ContentRequest, SyncStartResponse } from "../instagram.content";

type Screen = "main" | "settings" | "console";
type Tab = "review" | "kept" | "done";

type Notice = {
  tone: "neutral" | "danger";
  icon: string;
  title: string;
  sub: string;
  action?: { label: string; run: () => void };
};

const MAX_ROWS = 300;
const NOTICE_MS = 10_000;
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

let state: State;
let screen: Screen = "main";
let tab: Tab = "review";
let query = "";
let selectedId: string | null = null;
let selectedIndex = -1;
/** Accounts with an unfollow request in flight. */
const pending = new Set<string>();
let notice: Notice | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
/** The rows on screen, in order, for keyboard navigation. */
let visible: Account[] = [];

// ---------- Icons ----------

const ICONS: Record<string, IconNode> = {
  "arrow-left": ArrowLeft,
  "badge-check": BadgeCheck,
  "bookmark-x": BookmarkX,
  bookmark: Bookmark,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "circle-check": CircleCheck,
  "circle-pause": CirclePause,
  copy: Copy,
  "list-filter": ListFilter,
  "loader-circle": LoaderCircle,
  lock: Lock,
  "plug-zap": PlugZap,
  "refresh-cw": RefreshCw,
  search: Search,
  settings: SettingsIcon,
  "shield-alert": ShieldAlert,
  square: Square,
  terminal: Terminal,
  timer: Timer,
  "trash-2": Trash2,
  "undo-2": Undo2,
  "user-minus": UserMinus,
  users: Users,
};

/** Icon sizes follow the design: 16 in inputs and cards, 15 in icon buttons, 13 in row buttons. */
function icon(name: string, size = 15, className = ""): SVGElement {
  const svg = createElement(ICONS[name] ?? Circle, {
    width: size,
    height: size,
    "stroke-width": 2,
  });
  if (className) svg.classList.add(...className.split(" "));
  return svg;
}

/** Swaps the `<i data-icon>` placeholders in the static markup for SVGs. */
function hydrateIcons() {
  const sizes: [string, number][] = [
    [".logo", 12],
    [".search, .filter-btn, .banner", 16],
    [".option-icon", 14],
    [".btn", 14],
    [".option", 16],
    [".empty-icon", 20],
    [".input", 14],
  ];
  document.querySelectorAll<HTMLElement>("i[data-icon]").forEach((i) => {
    const size = sizes.find(([sel]) => i.closest(sel))?.[1] ?? 15;
    i.replaceWith(icon(i.dataset.icon ?? "", size, i.className));
  });
}

/** Fills the `data-i18n*` markup with the current language. */
function translateStatic() {
  document.documentElement.lang = locale();
  const attrs = ["title", "placeholder", "aria-label"];
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n as Key);
  });
  for (const attr of attrs) {
    document
      .querySelectorAll<HTMLElement>(`[data-i18n-${attr}]`)
      .forEach((node) => {
        node.setAttribute(
          attr,
          t(node.getAttribute(`data-i18n-${attr}`) as Key),
        );
      });
  }
}

// ---------- Instagram tab ----------

async function instagramTab() {
  const [active] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (active?.url?.startsWith("https://www.instagram.com/")) return active;
  const [any] = await browser.tabs.query({
    url: "https://www.instagram.com/*",
    currentWindow: true,
  });
  return any ?? null;
}

async function openUrl(url: string) {
  const tab = await instagramTab();
  if (tab?.id != null) await browser.tabs.update(tab.id, { url, active: true });
  else await browser.tabs.create({ url });
}

const openProfile = (a: Pick<Account, "username">) =>
  openUrl(`https://www.instagram.com/${a.username}/`);
const openInstagram = () => openUrl("https://www.instagram.com/");

async function send<T>(msg: ContentRequest): Promise<T | null> {
  const tab = await instagramTab();
  if (tab?.id == null) {
    showNotice({
      tone: "neutral",
      icon: "plug-zap",
      title: t("notice.openFirst"),
      sub: t("notice.openFirstSub"),
      action: { label: t("notice.open"), run: openInstagram },
    });
    return null;
  }
  try {
    return (await browser.tabs.sendMessage(tab.id, msg)) as T;
  } catch {
    showNotice({
      tone: "neutral",
      icon: "plug-zap",
      title: t("notice.reloadTitle"),
      sub: t("notice.reloadSub"),
      action: {
        label: t("notice.reload"),
        run: () => tab.id && browser.tabs.reload(tab.id),
      },
    });
    return null;
  }
}

function showNotice(n: Notice | null) {
  notice = n;
  clearTimeout(noticeTimer);
  if (n) noticeTimer = setTimeout(() => showNotice(null), NOTICE_MS);
  render();
}

const loggedOutNotice = (): Notice => ({
  tone: "neutral",
  icon: "plug-zap",
  title: t("notice.loggedOut"),
  sub: t("notice.loggedOutSub"),
  action: { label: t("notice.open"), run: openInstagram },
});

// ---------- Actions ----------

function isRunning(now = Date.now()) {
  const job = state.syncJob;
  return job?.status === "running" && !isStale(job, now, state.settings);
}

async function startSync() {
  if (isRunning()) return;
  const now = Date.now();
  // Check the cooldown here too, so it shows without an Instagram tab.
  const local = canSync({
    now,
    viewerId: state.syncJob?.viewerId ?? state.snapshot?.viewerId ?? "",
    snapshot: state.snapshot,
    job: state.syncJob,
    lockUntil: state.lockUntil,
    settings: state.settings,
  });
  if (!local.ok && local.reason === "cooldown")
    return cooldownNotice(local.until);
  if (!local.ok && local.reason === "locked") return render();

  showNotice(null);
  const res = await send<SyncStartResponse>({ type: "sync:start" });
  if (!res || res.started) return render();
  const g = res.gate;
  if (g.reason === "logged_out") showNotice(loggedOutNotice());
  else if (g.reason === "cooldown") cooldownNotice(g.until);
  else render();
}

function cooldownNotice(until: number | null) {
  showNotice({
    tone: "neutral",
    icon: "timer",
    title: state.snapshot
      ? t("notice.synced", { ago: ago(state.snapshot.syncedAt) })
      : t("notice.syncedRecently"),
    sub: t("notice.cooldownSub", { time: time(until) }),
  });
}

async function stopSync() {
  if (state.syncJob)
    await set("syncJob", { ...state.syncJob, stopRequested: true });
}

async function quickUnfollow(a: Account) {
  if (pending.has(a.id)) return;
  if (state.lockUntil > Date.now()) return render();
  const q = unfollowQuota(state.unfollowLog, Date.now(), state.settings);
  if (
    q.limited &&
    !confirm(t("confirm.limit", { time: time(q.nextSlotAt), user: a.username }))
  ) {
    return;
  }
  pending.add(a.id);
  render();
  const res = await send<UnfollowResult>({ type: "unfollow", userId: a.id });
  pending.delete(a.id);
  if (res && res.kind === "logged_out") showNotice(loggedOutNotice());
  else if (res && res.kind === "error") {
    showNotice({
      tone: "danger",
      icon: "shield-alert",
      title: t("notice.unfollowFailed", { user: a.username }),
      sub: res.message,
    });
  } else render();
}

async function toggleKeep(a: Pick<Account, "id" | "username">) {
  const keep = { ...state.keep };
  if (keep[a.id]) delete keep[a.id];
  else keep[a.id] = { username: a.username };
  await set("keep", keep);
}

async function undoDone(id: string) {
  const { [id]: _, ...rest } = state.done;
  await set("done", rest);
}

// ---------- Formatting ----------

function clock(at: number): string {
  const d = new Date(at);
  const hm = d.toLocaleTimeString(locale(), {
    hour: "2-digit",
    minute: "2-digit",
  });
  const days = Math.round(
    (new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
      86_400_000,
  );
  if (days === 0) return hm;
  if (days === 1) return t("time.tomorrow", { time: hm });
  return `${d.toLocaleDateString(locale(), { month: "short", day: "numeric" })} ${hm}`;
}

function time(at: number | null): string {
  if (!at) return "";
  const mins = Math.round((at - Date.now()) / 60_000);
  if (mins <= 0) return t("time.now");
  if (mins < 60) return t("time.inMin", { count: mins });
  return t("time.inHours", { count: Math.round(mins / 60), clock: clock(at) });
}

function ago(at: number): string {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 1) return t("ago.justNow");
  if (mins < 60) return t("ago.min", { count: mins });
  if (mins < 48 * 60) return t("ago.hours", { count: Math.round(mins / 60) });
  return t("ago.days", { count: Math.round(mins / 1440) });
}

const num = (n: number) => n.toLocaleString(locale());

// ---------- DOM helpers ----------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function btn(
  label: string,
  iconName: string | null,
  onClick: () => void,
  className = "btn",
  title = "",
): HTMLButtonElement {
  const b = el("button", { className, title });
  if (iconName) b.append(icon(iconName, className.includes("small") ? 11 : 13));
  if (label) b.append(label);
  b.onclick = (e) => {
    e.stopPropagation();
    onClick();
  };
  return b;
}

// ---------- Rendering: main ----------

function render() {
  for (const s of ["main", "settings", "console"] as Screen[])
    $(s).hidden = screen !== s;
  if (screen === "console") return renderLog();
  if (screen === "settings") {
    $("log-count").textContent = state.log.length ? num(state.log.length) : "";
    return;
  }

  const now = Date.now();
  const { snapshot } = state;
  const running = isRunning(now);

  // Header
  const sync = $<HTMLButtonElement>("sync");
  sync.classList.toggle("active", running);
  sync.querySelector("svg")?.classList.toggle("spin", running);
  sync.title = t(
    running
      ? "header.syncing"
      : state.syncJob
        ? "header.resume"
        : "header.sync",
  );
  $("hero").hidden = !snapshot;
  if (snapshot) {
    $("big-number").textContent = num(nonFollowerCount(snapshot));
    $("sub-stats").textContent = t("hero.stats", {
      followers: num(snapshot.followerIds.length),
      following: num(snapshot.following.length),
      ago: ago(snapshot.syncedAt),
    });
  }

  renderBanner(now, running);

  // First run: nothing to list yet.
  $("first-run").hidden = !!snapshot;
  $("sync-now").hidden = !!state.syncJob;
  $("content").hidden = !snapshot;
  $("action-bar").hidden = !snapshot;
  if (!snapshot) return;

  renderList(now);
  renderActionBar(now);
}

function renderBanner(now: number, running: boolean) {
  const job = state.syncJob;
  const wrap = $("banner");
  let card: HTMLElement | null = null;

  if (running && job) {
    card = syncCard(job);
  } else if (state.lockUntil > now) {
    card = banner({
      tone: "danger",
      icon: "shield-alert",
      title: t("banner.locked"),
      sub: t("banner.lockedSub", { time: clock(state.lockUntil) }),
    });
  } else if (job) {
    const reason = job.stopReason ?? "interrupted";
    const why =
      t(`why.${reason}`) +
      (reason === "error" && job.message ? ` (${job.message})` : "");
    card = banner({
      tone: "neutral",
      icon: "circle-pause",
      title: t("banner.paused"),
      sub: t("banner.pausedSub", {
        why,
        following: num(job.following.length),
        followers: num(job.followerIds.length),
      }),
      action: { label: t("banner.resume"), run: startSync },
    });
    card.querySelector(".btn")?.classList.add("primary");
  } else if (notice) {
    card = banner(notice);
  }

  wrap.hidden = !card;
  wrap.replaceChildren(...(card ? [card] : []));
}

function banner(n: Notice): HTMLElement {
  const text = el(
    "div",
    { className: "banner-text" },
    el("span", { className: "banner-title", textContent: n.title }),
  );
  if (n.sub)
    text.append(el("span", { className: "banner-sub", textContent: n.sub }));
  const top = el("div", { className: "banner-top" }, icon(n.icon, 16), text);
  if (n.action)
    top.append(btn(n.action.label, null, n.action.run, "btn small"));
  return el("div", { className: `banner ${n.tone}` }, top);
}

function syncCard(job: NonNullable<State["syncJob"]>): HTMLElement {
  const following = job.phase === "following";
  const card = banner({
    tone: "neutral",
    icon: "loader-circle",
    title: t(
      job.stopRequested
        ? "banner.stopping"
        : following
          ? "banner.syncingFollowing"
          : "banner.syncingFollowers",
    ),
    sub: "",
    action: job.stopRequested
      ? undefined
      : { label: t("banner.stop"), run: stopSync },
  });
  card.classList.add("running");
  card.title = t("banner.step", {
    step: following ? 1 : 2,
    following: num(job.following.length),
    followers: num(job.followerIds.length),
  });
  card.querySelector(".banner-top > svg")?.classList.add("spin");
  card.querySelector(".btn")?.prepend(icon("square", 11));

  // The last snapshot's counts estimate the totals; without one the bar is indeterminate.
  const estimate = following
    ? state.snapshot?.following.length
    : state.snapshot?.followerIds.length;
  const count = following ? job.following.length : job.followerIds.length;
  const step = (status: "done" | "active" | "pending") => {
    const fill = el("span");
    const bar = el("div", { className: "bar" }, fill);
    if (status === "done") fill.style.width = "100%";
    else if (status === "pending") fill.style.width = "0%";
    else if (estimate)
      fill.style.width = `${Math.min(95, (count / estimate) * 100)}%`;
    else bar.classList.add("indeterminate");
    return el("div", { className: `step ${status}` }, bar);
  };
  card.append(
    el(
      "div",
      { className: "steps" },
      step(following ? "active" : "done"),
      step(following ? "pending" : "active"),
    ),
  );
  return card;
}

type Row = {
  account: Pick<Account, "id" | "username"> & Partial<Account>;
  sub: string;
  actions: HTMLButtonElement[];
  className?: string;
};

function matches(username: string, fullName = "") {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    username.toLowerCase().includes(q) ||
    fullName.toLowerCase().includes(q)
  );
}

function renderList(now: number) {
  const { snapshot, settings } = state;
  if (!snapshot) return;
  const byId = new Map<string, Row["account"]>(
    snapshot.following.map((a) => [a.id, a]),
  );
  const review = candidates(snapshot, {
    keep: state.keep,
    done: state.done,
    settings,
    query,
  });
  const kept = Object.entries(state.keep);
  const done = Object.entries(state.done).sort((a, b) => b[1].at - a[1].at);

  // Tabs
  $("count-review").textContent = num(review.length);
  $("count-kept").textContent = num(kept.length);
  $("count-done").textContent = num(done.length);
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === tab);
  });

  // Toolbar
  $<HTMLInputElement>("search").placeholder = t(`search.${tab}`);
  $("filter-wrap").hidden = tab !== "review";
  if (tab !== "review") $("filter-menu").hidden = true;
  $("filter").classList.toggle("active", !$("filter-menu").hidden);
  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((o) => {
    o.classList.toggle(
      "on",
      !settings[o.dataset.filter as "hideVerified" | "hidePrivate"],
    );
  });
  const caption = tab === "review" ? "" : t(`caption.${tab}`);
  $("caption").textContent = caption;
  $("caption").hidden = !caption;

  // Rows
  const locked = state.lockUntil > now;
  let rows: Row[];
  let total: number;
  let empty: string;
  if (tab === "review") {
    total = review.length;
    rows = review.slice(0, MAX_ROWS).map((a) => ({
      account: a,
      sub: a.fullName,
      className: pending.has(a.id) ? "pending" : "",
      actions: [
        btn(
          t("action.keep"),
          "bookmark",
          () => toggleKeep(a),
          "btn",
          t("action.keepTitle"),
        ),
        unfollowButton(a, locked),
      ],
    }));
    empty = t(query ? "empty.noMatches" : "empty.review");
  } else if (tab === "kept") {
    rows = kept
      .map(
        ([id, k]): Row["account"] =>
          byId.get(id) ?? { id, username: k.username },
      )
      .filter((a) => matches(a.username, a.fullName))
      .map((a) => ({
        account: a,
        sub: a.fullName ?? "",
        actions: [
          btn(
            t("action.remove"),
            "bookmark-x",
            () => toggleKeep(a),
            "btn",
            t("action.removeTitle"),
          ),
        ],
      }));
    total = rows.length;
    empty = t(query ? "empty.noMatches" : "empty.kept");
  } else {
    rows = done
      .map(([id, d]) => ({
        a:
          byId.get(id) ??
          ({ id, username: d.username ?? id } as Row["account"]),
        d,
      }))
      .filter(({ a }) => matches(a.username, a.fullName))
      .map(({ a, d }) => ({
        account: a,
        sub: t("row.unfollowed", { ago: ago(d.at) }),
        className: "done",
        actions: [
          btn(
            t("action.undo"),
            "undo-2",
            () => undoDone(a.id),
            "btn",
            t("action.undoTitle"),
          ),
        ],
      }));
    total = rows.length;
    empty = t(query ? "empty.noMatches" : "empty.done");
  }

  // Keep the selection on the same account, or on the row that took its place.
  visible = rows.map((r) => ({
    fullName: "",
    isPrivate: false,
    isVerified: false,
    picUrl: "",
    ...r.account,
  }));
  if (selectedId && !visible.some((a) => a.id === selectedId)) {
    selectedId =
      selectedIndex >= 0
        ? (visible[Math.min(selectedIndex, visible.length - 1)]?.id ?? null)
        : null;
  }
  selectedIndex = visible.findIndex((a) => a.id === selectedId);

  const hadFocus = !!document.activeElement?.closest("#list .row");
  $("list").replaceChildren(...rows.map(rowEl));
  if (hadFocus) rowFor(selectedId)?.focus({ preventScroll: true });
  const hidden = total - rows.length;
  $("empty").hidden = rows.length > 0 && hidden === 0;
  $("empty").textContent =
    hidden > 0
      ? t("empty.truncated", { shown: num(rows.length), total: num(total) })
      : empty;
}

function unfollowButton(a: Account, locked: boolean): HTMLButtonElement {
  const busy = pending.has(a.id);
  const b = btn(
    "",
    null,
    () => quickUnfollow(a),
    "unfollow",
    t("action.unfollowTitle", { user: a.username }),
  );
  b.append(icon(busy ? "loader-circle" : "user-minus", 15, busy ? "spin" : ""));
  b.disabled = busy || locked;
  return b;
}

function rowEl(r: Row): HTMLLIElement {
  const a = r.account;
  // The card is the only tab stop: its link and buttons stay clickable but out of the tab order.
  const link = el("a", {
    href: "#",
    className: "username",
    textContent: a.username,
    title: t("row.open", { user: a.username }),
    tabIndex: -1,
  });
  link.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openProfile(a);
  };
  for (const b of r.actions) {
    b.tabIndex = -1;
    b.onmousedown = (e) => e.preventDefault(); // keep focus on the card
  }
  const top = el("div", { className: "who-top" }, link);
  if (a.isVerified) top.append(icon("badge-check", 12));
  if (a.isPrivate) top.append(icon("lock", 12));
  const li = el(
    "li",
    {
      className: `row ${r.className ?? ""} ${a.id === selectedId ? "selected" : ""}`,
      tabIndex: 0,
    },
    avatar(a),
    el(
      "div",
      { className: "who" },
      top,
      el("div", { className: "full-name", textContent: r.sub }),
    ),
    el("div", { className: "actions" }, ...r.actions),
  );
  li.dataset.id = a.id;
  li.setAttribute(
    "aria-label",
    `@${a.username}${a.fullName ? `, ${a.fullName}` : ""}`,
  );
  li.onfocus = () => select(a.id, false);
  li.onclick = () => li.focus();
  return li;
}

// ---------- Profile pictures ----------

/** Loaded pictures by URL: an object URL, or null when it failed (initials stay). */
const pics = new Map<string, string | null>();
const loading = new Map<string, Promise<string | null>>();

/**
 * Instagram's CDN may refuse to be embedded from other origins, so fetch the picture
 * (the extension has host access to the CDN) and show it from a blob URL.
 */
function loadPic(url: string): Promise<string | null> {
  const cached = pics.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  let p = loading.get(url);
  if (!p) {
    p = fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" })
      .then(async (r) => {
        const blob = await r.blob();
        if (!r.ok || !blob.type.startsWith("image/"))
          throw new Error(`HTTP ${r.status}`);
        return URL.createObjectURL(blob);
      })
      .catch(() => null)
      .then((src) => {
        pics.set(url, src);
        loading.delete(url);
        return src;
      });
    loading.set(url, p);
  }
  return p;
}

function showPic(box: HTMLElement, src: string) {
  const img = el("img", { src, alt: "", decoding: "async" });
  img.onerror = () => img.remove();
  box.append(img);
}

/** Loads pictures only for avatars scrolled into view. */
const picObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const box = e.target as HTMLElement;
      picObserver.unobserve(box);
      loadPic(box.dataset.pic ?? "").then(
        (src) => src && box.isConnected && showPic(box, src),
      );
    }
  },
  { rootMargin: "200px" },
);

function avatar(a: Row["account"]): HTMLElement {
  const box = el("div", {
    className: "avatar",
    textContent: a.username.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "?",
  });
  if (!a.picUrl) return box;
  const cached = pics.get(a.picUrl);
  if (cached) showPic(box, cached);
  else if (cached === undefined) {
    box.dataset.pic = a.picUrl;
    picObserver.observe(box);
  }
  return box;
}

function renderActionBar(now: number) {
  const { settings } = state;
  const q = unfollowQuota(state.unfollowLog, now, settings);
  // Show whichever window is closer to its limit.
  const hourRatio = q.lastHour / settings.hourlyLimit;
  const dayRatio = q.lastDay / settings.dailyLimit;
  const ratio = Math.min(1, Math.max(hourRatio, dayRatio));
  $("ring").style.setProperty("--p", `${ratio * 100}%`);
  $("rate").classList.toggle("limited", q.limited);
  $("rate-text").textContent = q.limited
    ? t("rate.limited", { time: time(q.nextSlotAt) })
    : dayRatio > hourRatio
      ? t("rate.today", { count: q.lastDay, limit: settings.dailyLimit })
      : t("rate.hour", { count: q.lastHour, limit: settings.hourlyLimit });
  $("rate").title = t("rate.title", {
    hour: q.lastHour,
    hourLimit: settings.hourlyLimit,
    day: q.lastDay,
    dayLimit: settings.dailyLimit,
  });

  const hints: Record<Tab, [string, string][]> = {
    review: [
      [t("action.keep"), "K"],
      [t("action.unfollow"), "⌫"],
    ],
    kept: [[t("action.remove"), "K"]],
    done: [[t("action.undo"), "U"]],
  };
  (["hint-primary", "hint-secondary"] as const).forEach((id, i) => {
    const h = hints[tab][i];
    const b = $<HTMLButtonElement>(id);
    b.hidden = !h;
    b.disabled = selectedIndex < 0;
    if (!h) return;
    b.querySelector("span")?.replaceChildren(h[0]);
    b.querySelector("kbd")?.replaceChildren(h[1]);
  });
}

// ---------- Keyboard ----------

const rowFor = (id: string | null) =>
  id
    ? $("list").querySelector<HTMLLIElement>(
        `.row[data-id="${CSS.escape(id)}"]`,
      )
    : null;

/** Selects a card. Selection follows focus, so Tab and the arrow keys move both. */
function select(id: string | null, focus = true) {
  selectedId = id;
  selectedIndex = visible.findIndex((a) => a.id === id);
  document.querySelectorAll<HTMLLIElement>("#list .row").forEach((li) => {
    li.classList.toggle("selected", li.dataset.id === id);
  });
  const li = rowFor(id);
  if (focus && li) li.focus({ preventScroll: true });
  li?.scrollIntoView({ block: "nearest" });
  renderActionBar(Date.now());
}

function move(delta: number) {
  if (!visible.length) return;
  const i =
    selectedIndex < 0
      ? delta > 0
        ? 0
        : visible.length - 1
      : Math.max(0, Math.min(visible.length - 1, selectedIndex + delta));
  select(visible[i]?.id ?? null);
}

/** Runs the action for a shortcut key on the selected row. */
function act(key: "keep" | "unfollow" | "undo") {
  const a = visible[selectedIndex];
  if (!a) return;
  if (key === "keep" && (tab === "review" || tab === "kept")) toggleKeep(a);
  if (key === "unfollow" && tab === "review" && state.lockUntil <= Date.now())
    quickUnfollow(a);
  if (key === "undo" && tab === "done") undoDone(a.id);
}

function onKey(e: KeyboardEvent) {
  if (
    screen !== "main" ||
    !state.snapshot ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey
  )
    return;
  const typing = e.target instanceof HTMLInputElement;
  if (e.key === "Escape") {
    if (!$("filter-menu").hidden) $("filter-menu").hidden = true;
    else if (typing) (e.target as HTMLInputElement).blur();
    else {
      (document.activeElement as HTMLElement | null)?.blur();
      select(null, false);
    }
    return render();
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (typing) (e.target as HTMLInputElement).blur();
    return move(e.key === "ArrowDown" ? 1 : -1);
  }
  if (typing) return;
  const k = e.key.toLowerCase();
  if (k === "/") {
    e.preventDefault();
    $("search").focus();
  } else if (k === "enter" && e.target instanceof HTMLLIElement) {
    const a = visible[selectedIndex];
    if (a) openProfile(a);
  } else if (k === "k") act("keep");
  else if (k === "backspace" || k === "delete") {
    e.preventDefault();
    act("unfollow");
  } else if (k === "u") act("undo");
}

// ---------- Activity log ----------

/** Rendered log version, so unrelated storage changes don't rebuild it (and close open entries). */
let renderedLog = "";
const openEntries = new Set<string>();
const entryKey = (e: LogEntry, i: number) => `${e.at}-${i}`;

function formatEntry(e: LogEntry): string {
  return `${new Date(e.at).toLocaleTimeString()} [${e.source}] ${e.text}`;
}

function renderLog() {
  const log = state.log;
  const version = `${log.length}-${log.at(-1)?.at ?? 0}`;
  if (version === renderedLog) return;
  renderedLog = version;
  const items = log
    .map((e, i) => {
      const key = entryKey(e, i);
      const head = el(
        e.detail ? "button" : "div",
        { className: "entry-head" },
        el("span", {
          textContent: new Date(e.at).toLocaleTimeString([], { hour12: false }),
        }),
        el("span", { className: "source", textContent: e.source }),
      );
      const li = el(
        "li",
        { className: e.level },
        head,
        el("span", { className: "message", textContent: e.text }),
      );
      if (e.detail) {
        const open = openEntries.has(key);
        head.append(
          icon(open ? "chevron-down" : "chevron-right", 12, "chevron"),
        );
        if (open) li.append(el("pre", { textContent: e.detail }));
        head.onclick = () => {
          if (openEntries.has(key)) openEntries.delete(key);
          else openEntries.add(key);
          renderedLog = "";
          renderLog();
        };
      }
      return li;
    })
    .reverse();
  $("log").replaceChildren(...items);
  $("log-empty").hidden = log.length > 0;
}

async function copyLog() {
  const text = state.log
    .map((e) => (e.detail ? `${formatEntry(e)}\n${e.detail}` : formatEntry(e)))
    .join("\n\n");
  await navigator.clipboard.writeText(text);
  $("log-status").textContent = t("log.copied");
  setTimeout(() => ($("log-status").textContent = t("log.status")), 2000);
}

// ---------- Settings ----------

const inputs = () => [
  ...$<HTMLFormElement>("settings-form").querySelectorAll("input"),
];

function fillSettings() {
  $<HTMLSelectElement>("language").value = state.settings.language;
  for (const input of inputs()) {
    const scale = Number(input.dataset.scale ?? 1);
    input.value = String(
      Number(state.settings[input.name as keyof Settings]) / scale,
    );
  }
}

/** Settings save as soon as a field changes and is valid. */
async function saveSetting(input: HTMLInputElement) {
  if (input.value === "" || !input.checkValidity())
    return input.reportValidity();
  const next = {
    ...state.settings,
    [input.name]: Math.round(
      Number(input.value) * Number(input.dataset.scale ?? 1),
    ),
  };
  if (next.maxDelayMs < next.minDelayMs) {
    if (input.name === "minDelayMs") next.maxDelayMs = next.minDelayMs;
    else next.minDelayMs = next.maxDelayMs;
  }
  state.settings = next;
  fillSettings();
  await set("settings", next);
}

function go(next: Screen) {
  screen = next;
  if (next === "settings") fillSettings();
  if (next === "console") renderedLog = "";
  render();
}

// ---------- Wiring ----------

async function refresh() {
  const before = state;
  state = await getAll();
  if (setLanguage(state.settings.language)) translateStatic();
  // A sync that was running is gone and a newer snapshot is in: it finished.
  if (
    before?.syncJob?.status === "running" &&
    !state.syncJob &&
    state.snapshot &&
    state.snapshot.syncedAt !== before.snapshot?.syncedAt
  ) {
    const n = nonFollowerCount(state.snapshot);
    return showNotice({
      tone: "neutral",
      icon: "circle-check",
      title: t("notice.syncDone"),
      sub: t(n === 1 ? "notice.syncDoneOne" : "notice.syncDoneMany", {
        count: num(n),
        time:
          time(
            state.snapshot.syncedAt +
              state.settings.syncCooldownHours * 3_600_000,
          ) || t("notice.syncAvailable"),
      }),
    });
  }
  render();
}

async function init() {
  hydrateIcons();
  await refresh();

  $("sync").onclick = startSync;
  $("sync-now").onclick = startSync;
  $("open-settings").onclick = () => go("settings");
  $("open-console").onclick = () => go("console");
  document.querySelectorAll<HTMLButtonElement>("[data-back]").forEach((b) => {
    b.onclick = () => go(b.dataset.back as Screen);
  });

  $<HTMLInputElement>("search").oninput = (e) => {
    query = (e.target as HTMLInputElement).value;
    render();
  };
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => {
    b.onclick = () => {
      tab = b.dataset.view as Tab;
      query = "";
      $<HTMLInputElement>("search").value = "";
      selectedId = null;
      selectedIndex = -1;
      render();
    };
  });

  $("filter").onclick = (e) => {
    e.stopPropagation();
    $("filter-menu").hidden = !$("filter-menu").hidden;
    render();
  };
  $("filter-menu").onclick = (e) => e.stopPropagation();
  document.addEventListener("click", () => {
    if ($("filter-menu").hidden) return;
    $("filter-menu").hidden = true;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((o) => {
    o.onclick = () => {
      const key = o.dataset.filter as "hideVerified" | "hidePrivate";
      set("settings", { ...state.settings, [key]: !state.settings[key] });
    };
  });

  $("hint-primary").onclick = () => act(tab === "done" ? "undo" : "keep");
  $("hint-secondary").onclick = () => act("unfollow");
  // Clicking a hint acts on the focused card without taking its focus.
  for (const id of ["hint-primary", "hint-secondary"])
    $(id).onmousedown = (e) => e.preventDefault();
  document.addEventListener("keydown", onKey);

  $<HTMLFormElement>("settings-form").onsubmit = (e) => {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
  };
  $<HTMLFormElement>("settings-form").onchange = (e) => {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLSelectElement)
      set("settings", {
        ...state.settings,
        language: target.value as Language,
      });
    else if (target.matches("input")) saveSetting(target as HTMLInputElement);
  };
  $("log-copy").onclick = copyLog;
  $("log-clear").onclick = () => set("log", []);
  $("clear").onclick = async () => {
    if (!confirm(t("confirm.clear"))) return;
    await clearAll();
    await refresh();
    go("main");
  };

  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") refresh();
  });
  setInterval(render, 30_000); // keep countdowns fresh
}

init();
