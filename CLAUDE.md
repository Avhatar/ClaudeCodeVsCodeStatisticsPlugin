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
- After any `src/` change: `npm run compile` → `npx --yes @vscode/vsce package --skip-license --allow-missing-repository` → `code --install-extension claude-usage-monitor-<version>.vsix` → tell the user to run `Developer: Reload Window` (and reopen the chart panel if it was open — `retainContextWhenHidden: true` keeps webviews alive across reloads).
- **As soon as you bump the version and run `vsce package`** — before moving on to anything else — update [CHANGELOG.md](./CHANGELOG.md) with a new section at the top (Keep a Changelog format) and bump the "Last updated" header in [DEV-NOTES.md](./DEV-NOTES.md) to match. Don't defer; deferred docs become wrong docs.

## Style

- Never use emojis in code, comments, or markdown unless the user explicitly asks.
- Prefer short, direct messages over running commentary.
- Default to writing no comments in code; add them only for non-obvious WHY.
