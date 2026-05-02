# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

The entire 0.x range was developed iteratively in a single working session
(2026-05-02) — versions are very granular by design.

## [0.20.0] - 2026-05-02
### Changed
- Chart visualization is now theme-independent. The chart panel and the
  sidebar mini-chart "island" use a fixed dark palette (background, borders,
  axis labels, grid, day-boundary dashes) regardless of the VS Code skin.
  The chart's white-on-dark dashes and low-alpha grid lines were tuned for a
  dark backdrop and were unreadable on light themes. The rest of the sidebar
  (stats text, progress bars, "Last fetched" line) still follows the VS Code
  theme.

## [0.19.0] - 2026-05-02
### Added
- Sidebar mini chart is now clickable — click anywhere on it to open the full
  chart panel (same as the toolbar `Show chart` button). The empty/error
  placeholders are also clickable, so you can jump to the chart even when the
  current Day window has no data.

## [0.18.0] - 2026-05-02
### Added
- Hook invocation log at `~/.claude/claude-usage-monitor-hook.invocations.log`.
  One structured line per hook run, with parts like `start | stdin=3b |
  token=present | mode=ok 5h=23.0% wk=28.0% | wrote=101b | dur=351ms`. Self-
  rotates when it grows past 100 KB (keeps the last 100 lines). Lets you see
  whether Claude Code actually invokes the hook — the most common
  "doesn't work" cause is a stale Claude Code session that never picked up
  the new `settings.json`.
- `Claude Usage: Show hook invocation log` command.
- Troubleshooting section in README: full Claude Code restart may be needed
  (not just `Developer: Reload Window`); guidance on reading the invocation
  log to find what went wrong.

### Changed
- **Removed all silent `try { … } catch {}` blocks in the hook.** Every error
  now has an explicit failure mode that lands in the invocation log and/or
  `process.stderr`: `creds-missing`, `creds-parse-error`, `creds-no-token`,
  `api-http=<code>`, `api-timeout`, `api-error=<code>`, `api-parse-error`,
  `log-mkdir-error`, `log-append-error`, `stdin-error`, `uncaught=<message>`.
- Hook ensures `~/.claude/` exists before appending to `usage-log.txt` (was
  silently swallowing the directory-missing error before).
- `package.json` declares `repository` (HTTPS URL to the GitHub repo). This
  enables relative image URLs in the README on the VS Code Marketplace and
  removes the need for the `--allow-missing-repository` flag in `vsce
  package`.
- `.vscodeignore` now excludes `DEV-NOTES.md`, `CLAUDE.md`, README screenshot
  PNGs, and any `*.zip` containers. The packaged `.vsix` shrunk from 92 KB
  to 42 KB.

## [0.17.0] - 2026-05-02
### Added
- "Focus on data" checkbox in the chart options. Clamps the X-window to
  `[firstSample - 1h, lastSample + 1h]`, capped to the original day range.
  Forecast still extends to the right edge of the focused window.
- `· focused` note in the chart subtitle when the option is on.

### Changed
- Mini chart in the sidebar moved to the bottom (below Last Turn / 5h bar /
  Weekly bar / Last fetched).
- `pickXTicks` rewritten with adaptive step selection
  (`[1h, 2h, 3h, 4h, 6h, 12h, 1d, 2d, 3d, 7d]`) and label format that follows
  the chosen step. Works for arbitrary windows, not only the previously
  hardcoded "1 day / 2-3 days / N days" buckets.

## [0.16.0] - 2026-05-02
### Added
- Mini chart in the left sidebar (240×96 SVG, no scripts), rendered in
  `webview.ts` from extension state. Shows the same gradients, day boundaries,
  reset markers (actual + predicted) and forecast as the main chart.
- New module `src/chartLogic.ts` with `ChartSettings`, defaults, `parseRange`,
  `windowFromRange`, `parseDur`, `midColor` — shared by extension and webview.
- Settings sync: chart panel now `postMessage`s its current settings to the
  extension whenever an input changes. Extension persists them in
  `globalState[claudeUsage.chartSettings]` and re-renders the sidebar so the
  mini chart stays in step with the main one.
- Initial sync from chart panel on load (so the sidebar gets fresh settings
  even if the user never touched anything in this session).

## [0.15.0] - 2026-05-02
### Added
- Predicted reset markers: vertical dashed line (same mid-color as actual reset
  markers) at `latestNonStaleSample.tsMs + parseDur(resetsIn)`. Separately for
  5h and weekly windows. Visible in the main chart whenever the predicted ts
  falls inside the visible window.
- `parseDur` for strings like `1h45m`, `2d14h`, `5m`, `now`.

### Changed
- `ChartTimePoint` (in `chart.ts`) extended with `fiveResetsIn`,
  `weekResetsIn`, `stale`. `prepareChartData` now takes `ParsedSample[]`.

## [0.14.1] - 2026-05-02
### Fixed
- "Forecast" had no room to draw on the current day because `windowFromRange`
  capped `toMs` at `nowMs` when `endDay === 1`. Now the window always extends
  to start-of-tomorrow (or end of the latest day in range), giving forecast
  room to extend to 100% or to the end of the day.

## [0.14.0] - 2026-05-02
### Added
- "Forecast" checkbox (off by default) in the chart options. Linear
  extrapolation from the last 5 visible samples; dashed line in the same
  gradient as the corresponding source line; clipped at 100% or window end.

## [0.13.2] - 2026-05-02
### Added
- Day-boundary markers: thin white dashed verticals at every local 00:00
  inside the chart window. Hidden when `daysSpan === 1`.

## [0.13.1] - 2026-05-02
### Added
- Actual reset markers: vertical dashed line at every sample where the limit
  dropped vs the previous sample. Color is the arithmetic midpoint of the
  saturated and faded gradient ends.

## [0.13.0] - 2026-05-02
### Added
- "Break on reset limit" checkbox in the chart options (default on). Wires
  the existing window-reset detection into the line-break logic.

### Changed
- Chart options under the chart now split into two rows: gap/break/forecast
  on top, gradients/reset on bottom.

## [0.12.1] - 2026-05-02
### Changed
- Default gradient endpoints updated to user's choice:
  - 5h: `#ff0000` → `#ffc2c2`
  - Weekly: `#2499ff` → `#a8cfff`
- Added "Reset colors" button that re-applies the HTML `value` defaults to
  every color picker (useful when persisted state holds older defaults).

## [0.12.0] - 2026-05-02
### Added
- Four `<input type="color">` pickers under the chart for gradient endpoints.
- State persistence via `acquireVsCodeApi().setState()` — `Day`, gap, gradient
  colors all survive panel close/open and window reload.

## [0.11.0] - 2026-05-02
### Added
- Gradient strokes for both lines via `<linearGradient gradientUnits="userSpaceOnUse">`:
  saturated at 0% used (chart bottom), faded at 100% used (chart top).
- Same gradient applied to data point fills.

## [0.10.0] - 2026-05-02
### Added
- Line break when current sample value is strictly less than the previous one
  (a 5h or weekly window reset). Applied per-line independently.

## [0.9.3] - 2026-05-02
### Fixed
- Regexes inside the `chartView.ts` template literal lost their backslashes
  during JS string evaluation (`\d` → `d`, etc.), which silently turned
  `parseRange("1")` into "empty". Doubled all regex backslashes inside the
  template (`\\d`, `\\(`, …) so the rendered script gets the intended escapes.
- Documented the gotcha in `DEV-NOTES.md`.

## [0.9.2] - 2026-05-02
### Added
- Diagnostic output for parse failures: when input cannot be parsed, the
  rendered error includes hex codepoints of every character so non-ASCII
  characters become visible.
- Normalization step that maps fullwidth digits `０-９` → ASCII `0-9` before
  parsing.

### Changed
- The regex normalization stripped `\s` (which the `Edit` tool had once
  silently replaced with NBSP). Switched to a Node-based patch script for
  surgical edits to avoid the issue.

## [0.9.1] - 2026-05-02
### Changed
- More aggressive whitespace cleanup before regex matching, plus a
  `parseInt`-based fallback if all regexes miss.
- Error message now includes `JSON.stringify(input)` to expose hidden chars.

## [0.9.0] - 2026-05-02
### Added
- Range syntax for the `Day` input. `1` = today only, `2` = yesterday only,
  `7` = single day six days ago, `(3)` = today + 2 days back, `1-7` = today
  through six days back, `3-7` = six days ago through two days ago.
- On parse failure, the chart area shows the rules cheat-sheet inline.
- "No usage data for <range>" message when the window is valid but empty.

## [0.8.1] - 2026-05-02
### Added
- "Break line on gap > N h" input under the chart. Default 8h. The path
  starts a new sub-segment when the time delta between adjacent samples
  exceeds the threshold (`0` disables).

## [0.8.0] - 2026-05-02
### Changed
- Removed the today/14-days dropdown. Replaced with a free-form `Days` input
  and a single timeline view that scales with the chosen window. Adaptive
  X-axis tick density.

## [0.7.0] - 2026-05-02
### Added
- `ParsedSample.stale` flag. Lines with a timestamp but no `5h`/`week` blocks
  (e.g. `limits: n/a (HTTP 429)` written by the user's pre-existing hook) are
  now registered as stale samples and carry forward the most recent valid
  values, so the chart doesn't lose those points.
- "stale (API unavailable)" hint in the sidebar when the latest sample is a
  carried-over copy.

## [0.6.2] - 2026-05-02
### Changed
- Bundled Stop hook is now resilient to API failure: on timeout, 429, network
  error or missing token it reads the latest valid line of the log and writes
  a stale row tagged `src=stale-api-fail` / `src=stale-no-token`. The
  timestamp is real, the percent value is just frozen until the next success.
- Hook fetch timeout reduced from 4s to 2s; stdin drain from 1500 ms to 800 ms.

## [0.6.1] - 2026-05-02
### Changed
- Bundled hook is now stateless. Removed the separate prev-cache JSON file —
  deltas are computed by the parser from neighbouring lines.

## [0.6.0] - 2026-05-02
### Added
- Bundled Stop hook script (`media/hooks/claude-usage-monitor-hook.js`).
- `Claude Usage: Install Stop hook` command that copies the script into
  `~/.claude/hooks/` and registers it under `hooks.Stop[]` in
  `~/.claude/settings.json`.
- `Claude Usage: Remove Stop hook` (with optional script delete) and
  `Claude Usage: Show hook status` commands.
- First-activation prompt offering to install the hook (skipped when an
  external Stop hook is already present and the log file exists, to avoid
  doubling API calls).
- Clickable "Install hook" link in the sidebar's `no-log` error state via
  `command:` URI (webview now has `enableCommandUris: true`).

## [0.5.0] - 2026-05-02
### Changed
- Major pivot. Removed all HTTP from the extension itself; the plugin is now a
  passive reader of `~/.claude/usage-log.txt`. Polling, cooldown logic,
  in-flight tracking, JSONL history, `prevLimits` global state, `api.ts`,
  `claudeUsage.pollIntervalSeconds` setting all gone. The Stop hook does the
  HTTP; the plugin just reads its log via `fs.watch`.
- New `src/logSource.ts` parses the hook's log line format and recovers
  missing deltas from neighbouring entries.
- New error states `no-log` (file missing — hook not installed) and
  `empty-log` (file exists but no parseable lines yet).

### Removed
- `src/api.ts`. Commands `claudeUsage.resetDelta`, `claudeUsage.clearHistory`,
  `claudeUsage.openHistoryFile`. Setting `claudeUsage.pollIntervalSeconds`.

## [0.4.3] - 2026-05-02
### Added
- `OutputChannel` "Claude Usage Monitor" with structured log lines for every
  poll, cooldown skip, history append, and error.
- `Claude Usage: Show plugin log` command.

### Fixed
- Diagnosed (but not yet solved) why JSONL history was never populating.
  Root cause turned out to be that `code --install-extension` does not reload
  already-active extensions; the user has to run `Developer: Reload Window`.

## [0.4.2] - 2026-05-02
### Changed
- Simplified `recordHistory` to write on every successful fetch
  unconditionally (previously the `shouldRecord` filter dropped zero-delta
  rows, which combined with persisted `prevLimits` meant nothing was ever
  written after a version bump).

### Removed
- Legacy log integration that briefly merged `~/.claude/usage-log.txt` into
  the chart data.

## [0.4.1] - 2026-05-02
### Added
- 30-minute heartbeat write to the JSONL history (so the chart wouldn't
  show big empty stretches between active sessions). Later removed in 0.5.0.

### Fixed
- First successful fetch after a version bump now writes a baseline entry
  even if the delta is zero.

## [0.4.0] - 2026-05-02
### Added
- "Claude Usage: Show chart" command opening a Webview Panel beside the
  editor. Today / Last 14 days dropdown, vanilla SVG line + bar charts with
  hover tooltips, gear icon in the sidebar header to open the chart.

## [0.3.0] - 2026-05-02
### Added
- Append-only JSONL history file at
  `globalStorageUri/usage-history.jsonl`. Each successful fetch with a
  non-zero 5h or week delta is logged.
- Commands: `Claude Usage: Show daily summary` (markdown side preview),
  `Open history file (raw JSONL)`, `Clear history` (with confirmation).
- `summarizeByDay` produces per-day positive-delta sums, peak %, sample
  count, active range.

## [0.2.2] - 2026-05-02
### Added
- Cooldown handling. `Retry-After` header is parsed (default fallback is
  5 min). While in cooldown, polling and manual refresh are skipped silently
  (rate-limit info toast is shown only on manual click).
- Status bar shows `$(clock) Claude: cooldown 4m 12s` during cooldown.

### Changed
- Default poll interval bumped from 30s to 60s (minimum 30s) to avoid
  triggering rate limits on the upstream OAuth usage endpoint.

## [0.2.1] - 2026-05-02
### Changed
- Status bar text format: `<icon> NN% (+ΔN%), MM% (+ΔM%)` (5h, weekly).
- "Last Turn" in the sidebar split into two equal-weight cards: 5h Δ and
  Week Δ.

## [0.2.0] - 2026-05-02
### Added
- Direct API polling. The extension itself reads
  `~/.claude/.credentials.json`, calls `https://api.anthropic.com/api/oauth/usage`,
  parses `five_hour`/`seven_day` windows, computes deltas via in-memory
  `globalState[prevLimits]`, and renders the same sidebar.
- Configurable `claudeUsage.pollIntervalSeconds`.
- Commands `Refresh now` and `Reset last-turn delta baseline`.

### Removed
- Dependency on the user's `~/.claude/usage-log.txt`. The extension no longer
  reads or watches it.

## [0.1.0] - 2026-05-02
### Added
- Initial release. Sidebar view (Activity Bar) with three cards: "Last Turn"
  (5h Δ), 5-Hour Limit progress bar, Weekly Limit progress bar.
- Status bar item with usage summary and click-to-refresh.
- Reads `~/.claude/usage-log.txt` (the user's pre-existing Stop hook output)
  via `fs.watch` with debounce, parses the line format `[ts] | … 5h X% (+Δ%)
  ↻Yh . week X% (+Δ%) ↻Zh`.
- `claudeUsage.logPath` setting to override the log location.
- Commands `Claude Usage: Refresh` and `Claude Usage: Open usage-log.txt`.
