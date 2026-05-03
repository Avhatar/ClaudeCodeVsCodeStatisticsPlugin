# Working rules for Claude Code in this repo

This file is loaded automatically by Claude Code. It is a list of imperatives, not a tutorial.
Full architecture, history, and rationale live in [DEV-NOTES.md](./DEV-NOTES.md). Read that before designing any non-trivial change.

## Architecture

- The extension MUST NOT make any HTTP calls. All network I/O lives in `media/hooks/*.js`. The plugin is a passive reader of `~/.claude/usage-log.txt`.
- The Stop hook is the only HTTP caller. It runs once per Claude Code Stop event and writes one line to the log. Do not add polling anywhere — we tried, it triggers rate limits.
- Stale rows (timestamp present, percent missing) are intentional. The hook writes them on API failure; the parser carries forward the last valid values. Do not "clean them up" — they preserve timeline points.

## Code-editing rules

- Inside the template literal in `src/chartView.ts`, every regex backslash MUST be doubled: write `\\d`, `\\(`, `\\-`. Single backslash is silently consumed by JS string-literal evaluation, breaking the regex when it reaches the webview.
- After modifying `src/chartView.ts`, verify by running `node -e "console.log(require('./out/chartView').renderChartHtml('x',{samples:[],generatedAt:'',generatedAtMs:0}).match(/replace\\(.+?\\)/g))"` and confirming the rendered regexes still contain `\d` etc.
- The `Edit` tool occasionally replaces a literal space inside `[ \\s]` with NBSP (`U+00A0`). If a regex breaks for no obvious reason, run `cat -A` on the file. Recovery: `Write` a `patch.js`, `Bash` to `node patch.js`, then delete it. Never re-introduce manual whitespace inside regex char classes via `Edit`.

## Multi-copy logic

`parseRange`, `windowFromRange`, `parseDur`, `midColor` exist in three places:
1. `src/chartLogic.ts` (TS) — used by the extension and the sidebar `webview.ts` mini chart.
2. Inline JS inside the `src/chartView.ts` template — used by the limits chart panel webview.
3. Inline JS inside the `src/tokensView.ts` template — used by the tokens chart panel webview (subset: only `parseRange` + `windowFromRange`).

When changing any of them, update ALL relevant copies in the same change. If this hits a fourth panel, factor the inline JS into a shared exported string constant rather than adding a fourth copy.

## Release discipline

- Bump `version` in `package.json` before every install. VS Code does not reliably re-load the same version, even after `Developer: Reload Window`.
- After any `src/` change: `npm run compile` → `npx --yes @vscode/vsce package --skip-license --allow-missing-repository --readme-path README.marketplace.md` → `code --install-extension claude-usage-monitor-<version>.vsix` → tell the user to run `Developer: Reload Window` (and reopen the chart panel if it was open — `retainContextWhenHidden: true` keeps webviews alive across reloads).
- The `--readme-path README.marketplace.md` flag is mandatory. Without it, vsce ships the engineer-facing `README.md` (architecture, clone/build, contributing) to the Marketplace, which is wrong audience.
- **As soon as you bump the version and run `vsce package`** — before moving on to anything else — update both changelogs and bump the "Last updated" header in [DEV-NOTES.md](./DEV-NOTES.md) to match. Don't defer; deferred docs become wrong docs.
  - [CHANGELOG.md](./CHANGELOG.md) is user-facing and shipped on the Marketplace. Keep entries short and what-changed only — no root causes, file paths, internal symbols, or rationale. One line per bullet where possible.
  - [DevChangelog.md](./DevChangelog.md) is the detailed per-version notebook for us — root causes, code paths, design decisions, the kind of nuance you'd write for future-you. This file is `.vscodeignore`-d, so verbosity is fine here. Every version bump must add a section here too.
- Two READMEs, one source of truth per audience. When a change touches user-visible features, commands, or settings, update **both** files — they share the user-facing sections, so they will drift if you only edit one.
  - [README.md](./README.md) is the GitHub view. Engineer-focused: includes the user-facing sections plus an Architecture / Contributing section with clone/build/packaging instructions.
  - [README.marketplace.md](./README.marketplace.md) is what the Marketplace details page shows (via `vsce package --readme-path`). User-facing only: no architecture or contributor blurb. Intentionally slimmer than the GitHub one.

## Style

- Never use emojis in code, comments, or markdown unless the user explicitly asks.
- Prefer short, direct messages over running commentary.
- Default to writing no comments in code; add them only for non-obvious WHY.
