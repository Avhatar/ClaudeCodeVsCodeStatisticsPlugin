# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

The entire 0.x range was developed iteratively in a single working session
(2026-05-02) — versions are very granular by design.

## [0.30.0] - 2026-05-03
### Fixed
- Tokens chart could throw `TypeError: undefined is not iterable` and
  silently fail to render when the visible window contained no
  cost-bearing turns (e.g. Day=1-2 with today empty). `pickYTicks(0)`
  was returning the wrong shape (`[{v:0,y:1}]` instead of
  `{ticks:[0],top:1}`), and the Y-axis loop blew up on the missing
  `.ticks` array. Now returns the correct shape — empty windows render
  the "No token data" message cleanly.
- Sidebar mini tokens chart Y-axis now scales to actual data (rounded
  up to the next nice 1/2/5 step) instead of flooring at 1. In USD
  mode where max-stack is typically $0.20-$0.50, the floor squashed
  every bar to ~25% of plot height; bars now use the full vertical
  range like the main chart does.

## [0.29.0] - 2026-05-02
### Added
- **Mini tokens chart in the sidebar** below the existing mini limits
  chart. Renders the same stacked-bar visualization as the full tokens
  panel — 4 cost-tier-coloured segments per turn — at 240×96 px. Click
  to open the full tokens panel. Top-right corner shows the totalled
  amount in the active Y mode (`$X.XX` for USD, `123K` for tokens).
- Tokens-chart settings (Day window, Y mode, gap, focus) sync to the
  sidebar via `postMessage` → `globalState` → re-render, mirroring the
  existing limits-chart sync pattern. Change Day to `7` in the full
  tokens panel and the mini tokens chart instantly shows a week.

### Changed
- **USD is now the default Y-axis mode** on the tokens chart for new
  users (HTML `selected` on the dropdown, plus `yMode: 'usd'` in
  `DEFAULT_TOKENS_CHART_SETTINGS`). Existing users with explicit
  webview state keep their previous choice; toggle once and the new
  default sticks.

## [0.28.0] - 2026-05-02
### Fixed
- Tokens-chart bars no longer overlap inside dense clusters of turns.
  Bar width is now clamped to the *minimum* inter-sample gap in the
  visible window (was the *average* gap, which under-estimated the
  tightest spacing — clusters of fast back-to-back turns rendered as
  a single mashed-together blob). Same upper cap of 8 px in sparse
  regions; min cap of 1 px so a single dense burst doesn't drive
  every bar to invisibility.

## [0.27.0] - 2026-05-02
### Added
- **Cost calculation on the tokens chart.** New Y-axis dropdown:
  `Tokens` / `Tokens (log)` / `USD (cost)`. In USD mode the same
  stacked bars show per-turn dollars, segments coloured by cost tier.
  Meta line gains `total: $X.XX` when in USD mode (or alongside totals
  in tokens modes). Tooltip always shows both token count and dollar
  cost per segment plus the model used for that turn.
- `pricing.json` is loaded once at activation and passed to the chart
  via `ChartData.pricing`. Webview does longest-prefix lookup
  (`claude-sonnet-4-7` → `claude-sonnet-4-6` → `claude-sonnet-4-5` →
  `claude-sonnet-4` → fallback) so log lines from a model that's
  newer than the bundled pricing table still get a reasonable estimate.
- Pricing snapshot fetched directly from
  https://platform.claude.com/docs/en/about-claude/pricing on
  2026-05-02. **Notable correction**: Opus 4.5/4.6/4.7 are now $5/$25
  per million tokens (input/output), not $15/$75 — Anthropic dropped
  Opus pricing significantly when 4.5 launched. Earlier Opus (4.1, 4,
  3) and Sonnet 3.7 / Haiku 3 / Haiku 3.5 also added.
- Pricing meta line shows the snapshot date (`prices 2026-05-02`)
  when in USD mode so it's obvious how stale the numbers are.

### Changed
- Renamed the Y-axis log toggle from a checkbox to a 3-way dropdown.
  Webview state migration: existing `logScale: true` is mapped to
  `yMode: 'logTokens'` on first load.
- Removed all Russian-language strings from the UI (a stray
  copy-paste in the cost-calculation instructions block).

## [0.26.0] - 2026-05-02
### Added
- Invocation log restored on the bundled hook
  (`~/.claude/claude-usage-monitor-hook.invocations.log`). Same format as
  v0.18: one structured line per run with parts joined by ` | ` —
  `start | stdin=Nb | turn in=N out=N c+=N c-=N model=… | token=present
  | mode=ok 5h=N% wk=N% | wrote=Nb | dur=Nms`. Self-rotates past 100 KB,
  keeps the last 100 lines.
- All previously silent `try/catch` blocks now produce labelled
  `invokeLog(...)` entries — including `creds-missing`,
  `creds-read-error=…`, `creds-parse-error=…`, `creds-no-token`,
  `cache-read-error=…`, `cache-parse-error=…`, `cache-write-error=…`,
  `api-http=N`, `api-timeout`, `api-error=CODE`, `api-parse-error=…`,
  `api-shape-unknown`, `transcript-missing-path`, `transcript-not-found=…`,
  `transcript-read-error=…`, `transcript-line-parse-failures=N`,
  `stdin-error=…`, `stdin-thrown=…`, `stdin-parse-error=…`,
  `log-mkdir-error=…`, `log-append-error=…`, `toast-error=…`,
  `uncaught=…`, `main-rejected=…`. Final line always carries
  `mode=ok …` or `mode=limits-fail …`.
- `process.on('exit', flushInvocationLog)` and `process.on(
  'uncaughtException', …)` so a crash still leaves a diagnostic line.

## [0.25.0] - 2026-05-02
### Changed
- **Bundled hook is now the canonical user-authored hook** (was a separate
  in-house implementation in 0.18-0.24). Single source of truth: the
  feature-rich hook that writes the existing `turn in:N out:N c+N c-N
  model=…  .  session N (M turns)  .  5h N% (±N%) ↻XhYm  .  week N% …`
  format with ANSI colours stripped before disk-write. Replaces the
  previous minimal hook that wrote only `turn (claude-usage-monitor) .
  5h N% . week N%`. New users get the full format on first install;
  `claudeUsage.updateHook` migrates older installs.
- Hook adds session totals + turn count (`session 215.49M (791 turns)`)
  to every line — the parser already tolerates this segment.
- Optional Windows toast on every Stop event via
  `~/.claude/hooks/show-toast.ps1` (silently no-ops if the script isn't
  present, which is the case for fresh extension installs).

### Removed
- The dedicated invocation log (`~/.claude/claude-usage-monitor-hook.invocations.log`)
  and labelled error categories (`creds-missing`, `api-http=…`, etc.)
  added in v0.18.0 are not present in the new bundled hook. Diagnosis
  for "hook installed but log not appearing" now relies on the user
  inspecting `usage-log.txt` itself and stderr from the hook process.
  May reintroduce later if needed.

## [0.24.0] - 2026-05-02
### Added
- **Hook now reads `transcript_path` from the Stop-event stdin** and extracts
  per-turn tokens (`input_tokens`, `output_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens`) plus `model`
  from the last assistant message in the transcript JSONL. Those are
  written to `usage-log.txt` as `turn in:N out:N c+N c-N model=<id>`. The
  shortened model id (date suffix `-YYYYMMDD` stripped) makes the line
  cheap to read and stable across minor model releases.
- Parser exposes `model` on `ParsedSample`, propagated through to
  `ChartTimePoint`. Old log lines without `model=` keep `model: null` and
  the new tokens chart still renders (cost calc will fall back to the
  default model from `pricing.json`).
- Hook-version detection: each hook script carries a
  `// claude-usage-monitor-hook v=X.Y.Z` header. Plugin reads that and
  compares to the bundled hook's version on activation.
- **"Update hook" prompt + sidebar banner** when the installed hook is
  older than the bundled one. Notification on activation, persistent
  yellow-bordered banner above the sidebar stats with an in-line "Update
  hook" button. New command `Claude Usage: Update Stop hook to bundled
  version`.
- `media/pricing.json` bundled with the extension, indexed by
  model-id prefix (e.g. `claude-sonnet-4-5`), with `input` / `output` /
  `cache_write_5m` / `cache_write_1h` / `cache_read` USD-per-million
  rates. Source URL embedded in the file. Includes `fallback` key so
  pre-v0.24 log lines without `model=` can still get an estimate.
- `Claude Usage: Open pricing.json` command, plus an instructions
  paragraph below the tokens chart explaining how to refresh prices
  (link to the canonical Anthropic page + a copy-pasteable Russian
  prompt for the user's Claude agent).
- Tokens panel webview gets `enableCommandUris: true` so the new
  "Open pricing.json" link in the instructions block actually works.

## [0.23.0] - 2026-05-02
### Changed
- Tokens chart "Focus on data" defaults to **on** for new users (was
  off in 0.22.0). Existing users keep whatever they had saved in
  webview state.
- Tokens chart bars now have a thin dark stroke (`#1e1e1e`, 0.5 px) on
  every segment so adjacent same-coloured bars are visibly separated
  instead of merging into one continuous block. Hover stroke (white)
  unchanged.

## [0.22.0] - 2026-05-02
### Added
- "Focus on data" checkbox on the tokens chart, mirroring the limits
  chart. When the visible window has samples, clamps the X axis to
  `[first - 1h, last + 1h]` (still inside the chosen Day range) so a
  cluster of activity fills the chart instead of being squeezed into a
  fraction of an empty 24-hour day. Meta line gains a `· focused`
  suffix while active.

## [0.21.0] - 2026-05-02
### Added
- Per-turn token data (`turn in:N out:N c+N c-N`, already written to the
  log by the hook since v0.7.0) is now parsed onto `ParsedSample` as
  `tokIn`, `tokOut`, `tokCacheCreate`, `tokCacheRead`. Older lines without
  that block keep null fields and are skipped by the new chart.
- New panel **Claude Usage — Tokens** (`Claude Usage: Show tokens chart`,
  also a second icon `$(symbol-numeric)` in the sidebar title bar).
  Stacked bar per turn with four cost-tier-coloured segments: output
  (red, top-priced), input (orange), cache-create (yellow), cache-read
  (green, cheapest). Hover gives exact numbers per segment plus total.
  Reuses the Day-range syntax of the limits chart and shows totals for
  the visible window in the meta line. Optional log-scale Y axis for
  sessions with large dynamic range.

### Changed
- Chart panel data now flows over `postMessage` instead of full
  `webview.html` reassignment. The html shell is rendered once on panel
  creation; every subsequent log change pushes a `{type:'data',...}`
  message to the webview, which mutates the existing SVG in place.
  Combined with `retainContextWhenHidden: true`, this means the chart
  keeps drawing fresh data while the panel is hidden behind other tabs
  — when the user switches back, the SVG is already current, with no
  re-mount/reflow flash.
- New `ready` handshake from webview to extension on script start, so
  the latest data is pushed even when the panel was opened from a
  serialized state and the bake-in is stale.

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
