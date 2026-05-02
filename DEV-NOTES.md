# Claude Usage Monitor — Dev Notes

> **Last updated:** 2026-05-02, against version **0.29.0**.
> Bump this header when you revise the file so future-you knows whether it tracks the current code.

VS Code extension that surfaces Claude Code subscription usage (5h / weekly windows) in a sidebar, status bar, and chart panel.

Built iteratively in one working session (May 2026, started from empty `x:\Projects\VsCodePlugins`). Current shipped version: **0.29.0**.

## Why this architecture (read first)

Two non-obvious decisions you'll be tempted to undo. Don't, unless you understand why they happened.

### Why the plugin does NOT call the API directly anymore

We started (v0.2.x–v0.4.x) by polling `https://api.anthropic.com/api/oauth/usage` from inside the extension on a 30s/60s timer. **That endpoint rate-limits aggressively.** Within a normal working session — combined with the user's own Stop hook also hitting the same endpoint — we got `HTTP 429` repeatedly. We tried Retry-After parsing, cooldown windows, longer intervals (up to 60s minimum). Still unreliable.

The realization: the **Stop hook** model is event-driven and naturally aligned with usage. It fires once per assistant turn, which is roughly once per real "transaction" the user cares about. Polling on top of that is double work. So we deleted the polling, deleted `api.ts`, and made the plugin a passive reader of the log file the hook already writes.

**The hard rule: HTTP calls live in the hook, never in the plugin.** If you're tempted to add a "manual refresh that hits the API" button, don't — it doesn't help, the hook fires on every turn anyway, and the API will rate-limit you exactly when the user is most active.

### Why stale records are necessary and unavoidable

Even with one HTTP caller (the hook), the OAuth `usage` endpoint sometimes returns 429 mid-session (the user's old hook logged 5 such failures in one hour we observed). When the API fails, the hook has no fresh data to write — but the turn still happened, and silently dropping the line means the chart loses points.

Our fix has two layers:

1. **The hook itself** falls back to reading the last valid line of `usage-log.txt` and writing those values again with a `src=stale-api-fail` tag. Better stale than missing — the timestamp is real, the % is just frozen until the next successful call.
2. **The parser** also handles legacy lines like `limits: n/a (HTTP 429)` written by the user's pre-existing hook (no `5h X%` block). It carries forward the previous valid sample's % so the chart still gets a point.

Resulting behaviour: a stretch of API-down periods shows up on the chart as a flat plateau — visually correct ("we don't know if it changed but we know there was a turn"). Daily-spend summary doesn't double-count because delta vs identical previous = 0.

UI surfaces this: the sidebar shows `· stale (API unavailable)` next to the timestamp when the latest sample is stale.

---

## What it does (current state)

- **Sidebar view** in the Activity Bar with:
  - "Last Turn" twin cards (5h Δ, Week Δ).
  - 5-Hour Limit and Weekly Limit progress bars.
  - "Last fetched" meta line (with stale flag if applicable).
  - **Mini chart** at the bottom — 240×96 SVG mirroring the main chart's settings (gradients, day boundaries, reset markers, forecast). Renders entirely server-side (no scripts in sidebar webview).
- **Status bar item** in the format `<icon> NN% (+ΔN%), MM% (+ΔM%)` (5h, weekly).
- **Chart panel** (`Claude Usage: Show chart`) — separate webview, full-featured. See the section below.
- **Daily summary** — markdown table opened to side, totals + per-day rows.
- **Stop-hook installer** — copies bundled hook script into `~/.claude/hooks/`, registers in `~/.claude/settings.json`. Auto-prompts on first activation if no hook detected.

## Chart panel features

A single `<svg>` drawn by inline JS in `chartView.ts`. Inputs across two rows of options:

**Top header:**
- `Day:` free-form text input. Syntax:
  - `1` = today only (default), `2` = yesterday only, `7` = single day six days ago.
  - `(N)` = today through (N−1) days ago, inclusive.
  - `N1-N2` = from oldest to newest, inclusive (`1-7` ≡ `(7)`).

**Top row of options:**
- `Break line on gap > N h` — splits the line into separate sub-paths when the time delta between adjacent samples exceeds the threshold. `0` disables.
- `Break on reset limit` (default on) — splits the line when the current value is strictly less than the previous one (window reset).
- `Forecast` (default off) — linear extrapolation from the last 5 samples to either 100% or the right edge of the window. Same gradient stroke as the source line, dashed.
- `Focus on data` (default off) — clamps the X window to `[firstVisible − 1h, lastVisible + 1h]`, capped to the original day range. Adaptive ticks adjust automatically.

**Bottom row of options:**
- `5-hour gradient: 0% [color] → [color] 100%` — saturated end at 0% used (chart bottom), faded end at 100% used (chart top).
- `Weekly gradient: 0% [color] → [color] 100%` — same idea for the weekly line.
- `Reset colors` button — restores HTML default values to all four pickers (useful if the persisted state is older than the current defaults).

**Always-on visual elements:**
- Y-axis grid at 0/25/50/75/100%.
- Adaptive X-axis ticks (`pickXTicks`) — picks a step from `[1h, 2h, 3h, 4h, 6h, 12h, 1d, 2d, 3d, 7d]` to keep ~6-7 ticks across the visible window. Label format follows the step (`HH:MM` for short windows, `MM-DD HH:MM` for mixed, `MM-DD` for long).
- Day-boundary verticals — thin white dashed lines at every local 00:00 inside the window, only when the window spans more than one day.
- Reset markers (vertical dashed, mid-color of the gradient) — both *actual* (where a sample value dropped) and *predicted* (where the latest non-stale sample's `↻Xh` countdown lands).
- Tooltips on hover over each point.

## Architecture

```
Claude Code  ──Stop event──▶  Stop hook (Node script)  ──appendFileSync──▶  ~/.claude/usage-log.txt
                                       │                                              │
                                       ▼                                              ▼
                              GET /api/oauth/usage                            VS Code plugin reads it
                              (Anthropic API)                                 (fs.watch + parser)
```

- **Single source of truth: `~/.claude/usage-log.txt`** (full path on Avhatar's box: `C:\Users\Avhatar\.claude\usage-log.txt`).
- The plugin **does not call any HTTP endpoints** itself. Only the hook does. The plugin is a passive reader + watcher.
- Hook fires once per Stop event (per assistant turn finishing). Each fire = one line in the log.
- Plugin watches the log via `fs.watch` (with 200ms debounce) and re-renders the sidebar on every change. The chart panel is updated via `postMessage` when its webview is open (see "Chart panel data flow" below).

### Chart panel data flow (`postMessage`, not `webview.html`)

The chart webview's html is rendered **once**, when the panel is created. Initial data is baked into the html so the first paint is never blank. From that point on, every log change is pushed to the webview as a `{type:'data', data: ChartData}` message; the inline JS mutates the existing SVG in place.

Why not just reassign `webview.html` on every change? VS Code defers/coalesces html updates to **hidden** webview panels, so a chart sitting behind another tab visibly froze until the user clicked back to it. With `retainContextWhenHidden: true` the JS context stays alive even when hidden, so DOM mutations driven by `postMessage` happen in real time and the chart is already current the moment the user switches back — no re-mount flash, no wait.

Handshake: the webview script `postMessage`s `{type:'ready'}` after its `render()` first runs. The extension responds with the current data via `pushChartData()`. This protects against the case where the log moved between the html bake-time and the script becoming ready (e.g. webview restored from a serialized state).

### Settings sync (chart panel ↔ sidebar mini chart)

Chart options are owned by the chart panel's webview. They persist via `acquireVsCodeApi().setState()` (per-webview, survives panel close/open and window reload).

To make the sidebar mini chart honor the same settings, the chart panel additionally `postMessage`s its settings to the extension on every change:

```
chartView.ts  ──postMessage({type:'settings',...})──▶  extension.ts
                                                            │
                                                            ▼
                                          globalState[claudeUsage.chartSettings]
                                                            │
                                                            ▼
                                       sidebar render reads here, falls back to defaults
```

`extension.ts` calls `panelProvider.update()` on receipt to re-render the sidebar immediately. On chart panel load, it calls `persist()` once before the first render so the sidebar has fresh values even if the user never touched any input this session.

## File map

```
claude-usage-monitor/
├── package.json                    manifest, commands, contributions
├── tsconfig.json
├── .vscodeignore
├── .gitignore
├── README.md
├── CHANGELOG.md
├── DEV-NOTES.md                    this file
├── LICENSE
├── media/
│   ├── icon.svg                    activity bar icon
│   └── hooks/
│       └── claude-usage-monitor-hook.js   bundled Stop hook (copied on install)
├── src/
│   ├── extension.ts                activation, commands, watcher, status bar, panels, message routing
│   ├── logSource.ts                parser + readers for usage-log.txt; ParsedSample type
│   ├── webview.ts                  sidebar HTML/CSS (no scripts) + renderMiniChart SVG
│   ├── chart.ts                    data prep — ChartTimePoint, prepareChartData (sorts samples)
│   ├── chartView.ts                chart panel HTML + inline JS (SVG render, all chart options)
│   ├── chartLogic.ts               shared TS module used by both extension and (in spirit) chartView:
│   │                               ChartSettings, DEFAULT_CHART_SETTINGS, parseRange,
│   │                               windowFromRange, parseDur, midColor
│   ├── history.ts                  summarizeByDay + markdown daily summary
│   └── hookSetup.ts                install/uninstall/status of the Stop hook
└── (build artifacts: out/, *.vsix — gitignored)
```

> Note: `chartView.ts` has its own copy of `parseRange`, `windowFromRange`, `parseDur`, `midColor` because it ships them as inline JS to the webview. `chartLogic.ts` is the canonical version used by extension TS code (and by `webview.ts` for the mini chart). When changing any of these functions, update both copies.

## Log line format (parser contract)

The parser in [src/logSource.ts](src/logSource.ts) accepts both the user's legacy hook format and our hook's format. Either is fine. Required fields:

- ISO timestamp in square brackets at line start: `[2026-05-02T14:14:29.770Z]`
- Block `5h X.XX%` (optional `(+1.00%)`, optional `↻45m`)
- Block `week X.XX%` (optional `(+0%)`, optional `↻2d13h`)

Examples that all parse:
```
[2026-05-02T13:33:27.801Z] | turn in:1 out:703 c+1.1K c-124K . session 10.47M (137 turns) . 5h 27% (+2.00%) ↻1h26m . week 24% (+0%) ↻2d14h
[2026-05-02T14:14:29.770Z] | turn (claude-usage-monitor) . 5h 41.00% ↻45m . week 25.00% ↻2d13h
```

### Stale-record handling

If a line has a timestamp but no `5h X%` block (e.g. user's hook writes `limits: n/a (HTTP 429)` when API rate-limits the hook itself), `parseLine` falls back to a `TS_ONLY_RE` regex and creates a `stale: true` sample with `NaN` values. In `readAll`, stale samples copy `five`/`week`/`resetsIn` from the most recent **non-stale** sample before them so:

- The chart doesn't lose the point.
- Daily summary doesn't double-count (delta to previous identical value = 0, ignored in `fiveHourSpent` accumulation).
- UI shows "stale (API unavailable)" note next to the timestamp.
- Predicted reset markers ignore stale samples — they would carry forward an outdated `↻Xh` countdown applied to a newer timestamp, giving wrong predictions.

Stale samples that come before any valid sample are dropped (no fallback available).

## Hook details ([media/hooks/claude-usage-monitor-hook.js](media/hooks/claude-usage-monitor-hook.js))

The bundled hook is the production version. It is **stateless** — does not maintain a separate cache file. Deltas are computed by the parser from neighbouring lines.

Behaviour:
1. Drains stdin (Claude Code passes JSON with `transcript_path` etc., but we don't use it).
2. Reads OAuth access token from `~/.claude/.credentials.json` (`creds.claudeAiOauth.accessToken`).
3. Calls `GET https://api.anthropic.com/api/oauth/usage` with `Authorization: Bearer <token>` and `anthropic-beta: oauth-2025-04-20` (timeout 2000ms).
4. Parses windows under any of these keys: `five_hour | fiveHour | 5h | five_hour_window | short_term | session | window_5h` (and analogous for weekly).
5. Extracts pct from `utilization | percent_used | percentage` (handles 0..1 and 0..100), or computes from `used/limit` / `consumed/total`.
6. Writes one line to `~/.claude/usage-log.txt` in the parser-compatible format.
7. **On any failure** (no token, timeout, 429, network, shape error): reads the most recent valid line via `LAST_LINE_RE`, writes a stale line with the same %s plus a tag (`src=stale-api-fail` or `src=stale-no-token`).

Why robust on failure: Claude Code's hooks have a short execution budget; a slow API call could lose the point entirely. Better to have a stale point than no point. The plugin parser already understands stale lines.

### Invocation log (since v0.18.0)

The hook also appends a single diagnostic line per run to `~/.claude/claude-usage-monitor-hook.invocations.log`. Format:

```
[2026-05-02T17:15:18.290Z] start | stdin=3b | token=present | mode=ok 5h=23.0% wk=28.0% | wrote=101b | dur=351ms
```

Possible parts: `start`, `stdin=Nb`, `creds-missing | creds-parse-error=<msg> | creds-no-token | token=present`, `api-http=<code> | api-timeout | api-error=<code> | api-parse-error=<msg>`, `mode=ok|stale-api-fail|stale-no-token|skip-…`, `wrote=Nb | log-mkdir-error=<msg> | log-append-error=<msg>`, `uncaught=<msg>`, `dur=Nms`.

Self-rotates: when the file exceeds 100 KB the hook truncates it to the last 100 lines on its next run.

The point: when a user reports "log not appearing", this file answers two questions immediately — *did Claude Code invoke our hook?* (file empty / file growing) and *what failed?* (which part shows up). The user-visible command `Claude Usage: Show hook invocation log` opens it.

The hook deliberately has **no silent `try/catch`** anywhere as of v0.18.0 — every failure surfaces in the invocation log and/or `process.stderr`. If you find yourself adding a bare `catch {}`, you're undoing this. Add a labelled `invokeLog(...)` instead.

## Plugin install / setup flow

`Claude Usage: Install Stop hook` calls [src/hookSetup.ts:installHook](src/hookSetup.ts):

1. `mkdir -p ~/.claude/hooks/`
2. Copy `media/hooks/claude-usage-monitor-hook.js` → `~/.claude/hooks/claude-usage-monitor-hook.js` (only if content differs).
3. Read `~/.claude/settings.json`. Add to `hooks.Stop[]`:
   ```json
   { "matcher": "", "hooks": [{ "type": "command", "command": "node \"<absolute-path>/claude-usage-monitor-hook.js\"" }] }
   ```
   Skip if already present (matched by substring `claude-usage-monitor-hook` in the command string).
4. Write back with 2-space indent + trailing newline.

Detection of "already installed elsewhere": the hook ID lives in the path, so `getHookStatus()` returns `registered: true` only for hooks with our marker. Other Stop hooks (e.g. user's own `usage-stats.js`) are counted as `externalStopHookCount`.

Auto-prompt on activation skips the prompt when:
- The user dismissed it before (`globalState.SETUP_PROMPT_DECLINED_KEY`), OR
- Our hook is already registered, OR
- An external Stop hook exists AND the log file exists (assumes someone else's hook is working).

## Build / package / install

From `claude-usage-monitor/`:

```powershell
npm install                                                   # one-time
npm run compile                                                # tsc -> out/
npx --yes @vscode/vsce package --skip-license --allow-missing-repository
code --install-extension claude-usage-monitor-<version>.vsix
```

The `vsce package` command output is what the user installs. After install, the user must run `Developer: Reload Window` for the new version to take effect (VS Code does NOT auto-reload extensions on update — burned us multiple times in this session). For chart-panel-only changes, also close and reopen the panel: `retainContextWhenHidden: true` keeps webviews alive across reloads.

## Settings & state

VS Code settings (`package.json` contributions):
- `claudeUsage.logPath` — override path to `usage-log.txt`. Empty = `~/.claude/usage-log.txt`.

(Polling-related settings were removed in v0.5.0 when we ditched API polling from the plugin itself.)

Persistent extension state:
- `globalState[claudeUsage.setupPromptDeclined]` — boolean, suppresses the install prompt when user dismissed it.
- `globalState[claudeUsage.chartSettings]` — `ChartSettings` object pushed by the chart panel. Used by sidebar mini chart.

Chart panel webview state (`acquireVsCodeApi().setState`):
- `{ days, gap, breakOnReset, forecast, focus, fiveSat, fiveFade, weekSat, weekFade }` — same shape as `ChartSettings`. Survives panel close/open and window reload, but is per-webview and not visible to other parts of the extension (that's why we also push to `globalState`).

## Commands

| Command | Description |
|---|---|
| `claudeUsage.refresh` | Re-read log immediately (also bound to status bar item click). |
| `claudeUsage.showChart` | Open chart webview panel beside the editor. |
| `claudeUsage.showDailySummary` | Open markdown summary in side preview. |
| `claudeUsage.openLogFile` | Open the raw `usage-log.txt` in an editor. |
| `claudeUsage.showLog` | Open the plugin's OutputChannel for diagnostics. |
| `claudeUsage.setupHook` | Install our bundled Stop hook. |
| `claudeUsage.removeHook` | Unregister the hook from settings.json (optional script delete). |
| `claudeUsage.showHookStatus` | Modal showing script presence, registration, count of other Stop hooks. |

## Version history (one session)

For full per-version notes see [CHANGELOG.md](./CHANGELOG.md). A condensed view:

- **0.1.0** — initial sidebar + status bar reading legacy log.
- **0.2.0–0.2.2** — switched to in-extension API polling, dual-card "Last Turn", rate-limit cooldown.
- **0.3.0** — own JSONL history file (later removed).
- **0.4.0–0.4.3** — chart webview, then debugging why JSONL never populated. Found: `code --install-extension` does not reload running extensions; `Developer: Reload Window` is required.
- **0.5.0** — **major pivot.** Dropped all HTTP from the plugin. Plugin became a passive reader of `~/.claude/usage-log.txt`. Removed `api.ts`, polling, cooldown, JSONL, related settings.
- **0.6.0–0.6.2** — bundled Stop hook + auto-installer + settings.json editor; stateless hook; resilient stale-on-failure writes.
- **0.7.0** — parser handles stale lines (carries forward last valid values).
- **0.8.0–0.8.1** — replaced today/14d dropdown with free-form `Days` input, single-timeline view, "Break line on gap > N h" option.
- **0.9.0–0.9.3** — range syntax `1`, `(N)`, `N1-N2`; on-error rules cheat-sheet; **fix for the regex-backslash gotcha** (see below).
- **0.10.0** — line break on window reset (per-line).
- **0.11.0–0.12.1** — gradient strokes (saturated → faded by used %), four user-configurable color pickers, "Reset colors" button.
- **0.13.0–0.13.2** — split chart options into two rows; "Break on reset limit" checkbox; actual + day-boundary markers.
- **0.14.0–0.14.1** — "Forecast" checkbox; window now always extends to start-of-tomorrow so forecast has room to draw.
- **0.15.0** — predicted reset markers from `↻Xh` countdown of the latest non-stale sample.
- **0.16.0** — sidebar mini chart + chart-panel-to-extension settings sync via `postMessage` and `globalState`. New shared `chartLogic.ts`.
- **0.17.0** — "Focus on data" zoom; mini chart moved to bottom of sidebar; adaptive `pickXTicks`.
- **0.18.0** — invocation log for the hook; all silent `try/catch` replaced with labelled error logging; `Claude Usage: Show hook invocation log` command; README troubleshooting on full Claude Code restart; `repository` field in `package.json`; `.vscodeignore` excludes docs and screenshots from the packaged `.vsix`.
- **0.19.0** — sidebar mini chart wrapped in `<a href="command:claudeUsage.showChart">` so a click opens the full chart panel. Works because the sidebar webview is created with `enableCommandUris: true` (and `enableScripts: false` — the link does not require any JS in the sidebar). Also clickable when the mini chart shows the empty/error placeholder.
- **0.20.0** — chart visualization is locked to a dark palette regardless of VS Code theme. Chart panel `:root` no longer reads `--vscode-editor-background`/`--vscode-foreground`/etc. — uses fixed hex (`#1e1e1e`, `#2a2a2a`, `#3c3c3c`, `#ddd`, `#999`). Mini-chart island in `webview.ts` hardcodes the same dark backdrop on `.mini-svg` and `.mini-empty`. Reason: white/low-alpha-white SVG strokes (day-boundary dashes, grid) were tuned for a dark canvas and were invisible on light VS Code themes. Surrounding sidebar text/bars still follow the VS Code theme so the activity-bar surface integrates normally; only the chart "island" is locked.
- **0.21.0** — chart panel data flow switched from `webview.html` reassignment to `postMessage`. Html is rendered once at panel creation; every subsequent log change pushes a `{type:'data', data}` message to the webview, which mutates the existing SVG. With `retainContextWhenHidden: true` (already in place) the chart now keeps drawing while the tab is hidden — previously VS Code would coalesce hidden-webview html updates and the chart appeared frozen until the user switched back. Added a `{type:'ready'}` handshake so the latest data is pushed even when the panel was restored from a serialized state. **Tokens chart**: parser extracts per-turn `tokIn` / `tokOut` / `tokCacheCreate` / `tokCacheRead` (regex `TOKENS_RE` against `turn in:N out:N c+N c-N`, with `parseShort` for `K`/`M` suffixes; nullable so old log lines don't break). New webview `tokensView.ts` renders stacked bars per turn with 4 cost-tier colours, log-scale toggle, hover tooltip, and reuses Day-range/break-on-gap conventions from the limits chart. Money/cost overlay deferred to next version (needs model name from transcripts; the log doesn't carry it yet).
- **0.22.0** — "Focus on data" checkbox on the tokens chart. Same logic as the limits chart's focus mode: after computing `visible`, clamps `[fromMs, toMs]` to `[first - 1h, last + 1h]` (intersected with the original window) so a cluster of activity fills the chart instead of being squeezed into a fraction of a 24h day. Persisted in webview state.
- **0.23.0** — tokens chart "Focus on data" now defaults to on (HTML `checked`), with saved webview state still winning over the default. Bar segments gain a 0.5 px `#1e1e1e` stroke so adjacent same-coloured bars don't merge — was a real readability problem with consecutive cache-read-heavy turns where two green bars looked like one wide one.
- **0.25.0** — bundled hook is replaced with the canonical user-authored implementation that already writes the rich `turn in:N out:N c+N c-N model=…  .  session N (M turns)  .  5h … week …` format with ANSI colours (stripped before append). Single source of truth — same code is the one running on the maintainer's machine and the one installed on fresh setups. Adds session totals + turn count to every line; optional Windows toast via `show-toast.ps1` (silent no-op if absent). Trade-off: no invocation log + labelled error categories from v0.18; if "hook installed but log empty" complaints recur we can re-add. Hook still carries the `// claude-usage-monitor-hook v=0.25.0` marker so the plugin's `readHookVersion()` keeps working — `installHook` writes the new content to `~/.claude/hooks/claude-usage-monitor-hook.js` and the version-mismatch banner offers an update from older bundled v0.18-0.24 installs.
- **0.26.0** — invocation log restored on the v0.25 hook (we walked back the trade-off — still nice to keep diagnostic capability). `~/.claude/claude-usage-monitor-hook.invocations.log` self-rotates past 100 KB; every previously silent `try/catch` now has a labelled `invokeLog(...)` (about 20 distinct labels, see CHANGELOG for the full list). `process.on('exit', flushInvocationLog)` + `process.on('uncaughtException', ...)` cover crash paths. The user-facing log line written to `usage-log.txt` is byte-identical to v0.25 — only the diagnostic side-channel was added.
- **0.29.0** — tokens chart gets its own settings sync (`TokensChartSettings` + `TOKENS_SETTINGS_KEY` in globalState) mirroring the limits-chart pattern: tokens panel posts `{type:'tokenSettings', settings}` → extension stores → sidebar re-renders. New `renderTokensMiniChart()` in webview.ts takes those settings + the pricing table and draws the same 4-segment stacked-bar visualization at 240×96 px, clickable to open the full panel. USD becomes default Y mode (HTML `selected`+`DEFAULT_TOKENS_CHART_SETTINGS.yMode = 'usd'`). The mini chart re-uses min-gap-bar-width, focus-on-data, day-boundary verticals from the main chart so the two stay visually consistent.
- **0.28.0** — tokens-chart bar width clamped to *minimum* inter-sample gap rather than average. Average under-estimates the tightest spacing inside clusters; bars overlapped visibly in busy windows. Min-gap guarantees no overlap at the cost of bars in sparse regions being narrower than they could be — a uniform-width visual rhythm everywhere is the intended trade-off.
- **0.27.0** — cost calculation lands on the tokens chart. New `src/pricing.ts` loads `media/pricing.json` once at activation (no HTTP, all bundled). `ChartData` gains a `pricing: PricingTable | null` field; webview does longest-prefix model lookup (`claude-sonnet-4-7` → strip `-7` → `claude-sonnet-4-6` → `…-5` → `…-4` → fallback) so log lines from a model newer than the bundled snapshot still get a price. New Y-axis dropdown `Tokens / Tokens (log) / USD (cost)`; in USD mode the same 4 stacked segments represent per-turn dollar amounts (out × output_rate + in × input_rate + c+ × cache_write_5m_rate + c- × cache_read_rate, all per-million). Tooltip always shows both tokens and USD plus the model. Pricing snapshot pulled fresh from the Anthropic docs page; key correction vs. earlier guesses — **Opus 4.5+ dropped from $15/$75 to $5/$25**, that's a real Anthropic price cut not a typo. Cache writes default to the 5-minute rate because the log doesn't currently distinguish 5m vs 1h ephemerals — could be promoted to a hook-level field later if precision matters.
- **0.24.0** — hook is now self-sufficient for token + model logging: `readLastTurnFromTranscript()` reads the `transcript_path` it already gets on Stop-event stdin, scans the JSONL backwards for the last `type:"assistant"` record, pulls `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}` and `message.model` (date suffix stripped). Writes those into the existing `turn in:N out:N c+N c-N model=...` line so the parser changes were minimal (one new optional regex `MODEL_RE` matching `\bmodel=([\w.\-]+)`). Hook gains a `// claude-usage-monitor-hook v=X.Y.Z` header so the plugin can detect outdated installs (`readHookVersion()`) and prompt update via a notification + sidebar banner. New `claudeUsage.updateHook` command (idempotent — same as `installHook`). Bundled `media/pricing.json` indexes models by id-prefix with the four rate types per model and a fallback for unknown ids; `claudeUsage.openPricingFile` opens the file in editor; tokens chart shows an instructions paragraph linking to the Anthropic pricing page and the file. Cost calculation itself is deferred to v0.25 — this version ships the data plumbing only.

## Gotcha: regex backslashes inside template literals

`chartView.ts` returns a TS template literal that contains a `<script>` block. **Anything written between the backticks is evaluated by JS as a string literal first** — so `\d`, `\s`, `\(`, etc. silently lose their backslash before the HTML even reaches the webview, because they aren't valid string escapes. Inside the template, write `\\d`, `\\s`, `\\(`, `\\)`, `\\-` — they become `\d`, `\s`, `\(` etc. in the rendered script, where the regex engine actually parses them.

This bit us repeatedly in the v0.9.x range — `parseRange` returned "empty" for input `"1"` because the cleanup regex `/[^\d()\-]/g` silently became `/[^d()-]/g` and stripped digits.

Verify after editing: `node -e "console.log(require('./out/chartView').renderChartHtml('x',{samples:[],generatedAt:'',generatedAtMs:0}).match(/replace\\(.+?\\)/g))"` and check that the rendered regexes still contain single backslashes (e.g. `\d`).

A separate gotcha: the `Edit` tool occasionally turned a literal space inside `[ \s]` into NBSP (` `), invisibly breaking the regex char class. If a regex stops working without obvious cause, run `cat -A` on the file or rewrite via a Node patch script (`Write` a `patch.js`, `node patch.js`, delete) — that path doesn't go through any tool's whitespace normalization.

## Two-copy logic (chartLogic.ts vs chartView.ts inline JS)

`parseRange`, `windowFromRange`, `parseDur`, `midColor` exist twice:

- **TS module** in `src/chartLogic.ts` — used by extension code (`webview.ts` for the mini chart, `extension.ts` for `ChartSettings` defaults).
- **Inline JS** inside the `chartView.ts` template literal — runs in the chart-panel webview where the chart settings UI lives.

When changing parsing behaviour, update both. The inline JS copy uses `\\d` etc. (see gotcha above). The TS module copy uses regular `\d`.

## Known limitations / next steps

- The OAuth `usage` endpoint is undocumented. If Anthropic changes its shape or removes it, the hook breaks. The parser code in `pickWindow`/`extractPct` is defensive (multiple key spellings) but still depends on the API.
- **"Replace external hook" not implemented.** If a user has their own hook (e.g. older `usage-stats.js`) and wants to switch to ours, they have to remove theirs from `settings.json` manually first.
- **Stale points look identical to real points.** Could render them with reduced opacity to make API gaps visible. Deferred.
- **Hook does not parse `transcript_path`.** Could pull `input_tokens`, `output_tokens`, `cache_*` per turn and let the daily summary show "tokens spent" alongside "% spent", or compute approximate cost. Not implemented.
- **No telemetry, no auto-update channel** — distribution is manual `.vsix`.
- **Two-copy logic in `chartLogic.ts` and `chartView.ts`** (see above) is fragile. Could be solved by generating the inline JS from a TS module via a build step, but the indirection isn't worth it for the current code size.

## Distribution

Hand the user the `.vsix` from this directory (currently `claude-usage-monitor-0.29.0.vsix`, ~64 KB). Requirements: VS Code 1.85+, Claude Code installed and `/login`-ed, Node.js on PATH. After install + Reload Window the auto-prompt offers to install the Stop hook; one click and they're done. If the log doesn't start populating, check `Claude Usage: Show hook invocation log` and the README Troubleshooting section.
