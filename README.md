# IG Unfollow Helper

A Chrome extension that shows the Instagram accounts you follow that don't follow you back, and helps you unfollow them **by hand**, at a pace you set.

It never unfollows anyone on its own: every unfollow is one click of yours. Either you press the unfollow button next to an account, or you open its profile (click the username) and press Instagram's own **Following → Unfollow** button. Either way, the extension crosses the account off.

## Features

- **Side panel** that stays open next to Instagram.
- **Don't follow you back** list with search, plus toggles to hide verified and private accounts.
- **Keep list**: accounts that never show up for review.
- **Unfollow detection**: spots the request Instagram sends when you press Unfollow, so it works in any interface language. The **unfollow** button next to each account unfollows it right away, one click per account, for the ones you recognize without opening the profile.
- **Keyboard**: Tab or ↑/↓ to move from account to account, **K** to keep, **Delete**/**⌫** to unfollow, **U** to undo, **Enter** to open the profile, **/** to search.
- **Activity log** (in Settings): every request the extension sends and every follow/unfollow request Instagram sends, with status and response, for debugging. Tokens are redacted; **Copy all** puts it on the clipboard.
- **English and Spanish**: pick the language in **Settings**. English is the default.
- **Soft limits**: 30 unfollows per rolling hour and 120 per rolling 24 h by default. When you reach one, the unfollow button asks before going on. If Instagram pushes back on an unfollow, both unfollows and syncs lock for 24 h.

## Guardrails

The extension reads your following and followers lists from Instagram's web API, using the session of the Instagram tab you're logged into. To stay well within Instagram's limits:

- It only syncs when you press **Sync**, never in the background.
- It sends one request at a time, with a random 3–7 s pause between pages.
- After a complete sync, it waits 12 h before allowing the next one.
- On a rate limit, checkpoint or challenge, it stops immediately and locks syncing for 24 h. Progress is kept, so the next sync resumes where it stopped.
- Each run fetches at most 10,000 accounts; past that, it pauses and you resume by hand.
- A partial sync never replaces your last complete one. A half-fetched followers list would flag people who do follow you back.

All of these can be changed in **Settings** (the gear icon). Changes save as you make them.

## Privacy

Everything stays in `chrome.storage.local` on your machine. There is no server and no analytics. The extension stores no credentials. It can access `www.instagram.com`, plus Instagram's image CDNs (`*.cdninstagram.com`, `*.fbcdn.net`) to show profile pictures.

## Install

There is no Chrome Web Store listing. Build it and load it unpacked:

```sh
bun install
bun run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select `.output/chrome-mv3`.
3. Open instagram.com (reload it if it was already open), then click the extension icon to open the side panel.

## Use

1. Press **Sync**. With 1,000 accounts, it takes about 2 minutes.
2. Press the unfollow button (or **⌫**) to unfollow an account, or **Keep** to never see it again.
3. Not sure about one? Click its username to open the profile in your Instagram tab.

## Development

```sh
bun run dev        # Chrome with the extension loaded and hot reload
bun run test       # unit tests (Vitest) for the pure logic in lib/
bun run typecheck
bun run lint       # Biome lint and format check (lint:write to fix)
```

| Path | What it does |
| --- | --- |
| `entrypoints/sidepanel/` | The UI |
| `entrypoints/instagram.content.ts` | Runs syncs and one-click unfollows, stores detected unfollows (isolated world) |
| `entrypoints/watcher.content.ts` | Observes Instagram's follow/unfollow requests (page world) |
| `entrypoints/background.ts` | Opens the side panel from the toolbar icon |
| `lib/` | Pure logic: Instagram API parsing, sync engine, pacing, candidates |
| `assets/icon.svg` | Icon source. `public/icon/*.png` are rendered from it |

## Disclaimer

This project isn't affiliated with Meta or Instagram. It relies on Instagram's undocumented web API, which can change without notice. Use it at your own risk.

## License

[MIT](LICENSE)
