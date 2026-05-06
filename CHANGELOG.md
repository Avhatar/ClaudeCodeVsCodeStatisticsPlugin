# Changelog

User-visible changes only. For root causes, design decisions and internal mechanics see [DevChangelog.md](./DevChangelog.md).

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [0.66.0] - 2026-05-06
### Changed
- Weekly forecast trend now uses every visible sample sharing the latest weekly reset (i.e. the whole current week window) instead of just the last 5 turns. Yesterday's points participate now, so the trend stops reading "flat" on days when today's handful of small turns barely move the API-rounded weekly percentage. The 5h forecast keeps its last-5-samples behavior — short window, recent rate is the right input.

## [0.65.0] - 2026-05-05
### Fixed
- The chart no longer draws a runaway zero-crossing line off the right side of every sample after a window reset. Cause: the API's `resets_at` timestamp jitters by microseconds sample-to-sample even within the same window, so strict string equality treated each sample as a fresh reset. The tolerance for "different reset moment" is now 60 seconds, matching the parser's existing reset-detection epsilon. Most visible with **Break on reset limit** on.

## [0.64.0] - 2026-05-05
### Changed
- Bugged-API filter rewritten with two strict, deterministic rules — no thresholds besides `100%` itself, no pending state. With **Ignore bugged API data** on:
  - If a sample reads exactly `100%` and the window just crossed a reset, force the value to `0%` (a fresh window structurally starts at zero).
  - If a sample reads exactly `100%` mid-window and the previous reading was `≤ 70%`, carry forward the previous value.
  - All other readings trusted — including legitimate near-saturation like `95%` or `99%` that the previous heuristic-style threshold would have wrongly flagged.

## [0.63.0] - 2026-05-05
### Fixed
- When the API returns a bugged 100% on **two or more consecutive turns** right after a window reset (rare but observed today: `18:00:57` and `18:04:21` both got `5h 100%` after the 18:00 reset), the suppression now keeps applying for as long as the saturated values keep coming, instead of releasing on the very next sample and letting a 100% propagate forward into the new window. Only relevant when **Ignore bugged API data** is on.

## [0.62.0] - 2026-05-05
### Changed
- The 2-hour line break introduced in 0.61 is now driven by the existing **Break line on gap** setting under the limits chart, with its default lowered from 8h to 2h. Set it to 0 to disable gap-based breaks; raise it to keep the line continuous across longer gaps.

## [0.61.0] - 2026-05-05
### Changed
- Window resets on the chart are now drawn from the actual API timestamp (`resets_at`), no longer approximated from the per-sample countdown. Hook 0.46 starts logging the exact ISO; the install button bumps it for you. New entries get a precise dashed marker and zero-crossing at the real reset moment. Old log entries (pre-hook-0.46) don't carry the ISO and so don't draw a reset marker at all — separation between samples on either side of an unknown reset comes from a 2-hour time-gap break instead. Either way, no heuristic-based reset detection is used for chart visualization any more.

## [0.60.0] - 2026-05-05
### Changed
- Lines no longer connect across window resets. The previous window's line ends at its last sample; the new window's line starts as its own segment. With **Break on reset limit** on, the new segment begins at the zero-crossing at the actual reset moment (the fresh window is structurally 0% there); with it off, the new segment starts directly at the first post-reset sample. Either way, no slope is drawn from old window to new.

## [0.59.0] - 2026-05-05
### Changed
- The chart curve now drops to 0% at the actual moment of every window reset and rises again from there to the next sample — a fresh window starts at 0% by definition, so the curve passes through that zero crossing structurally. Both the limits chart panel and the sidebar mini chart get this. The dashed vertical reset marker also moved from the sample timestamp to the actual reset moment (computed from the sample's countdown), so marker and curve align exactly.

## [0.58.0] - 2026-05-05
### Fixed
- The chart's window-reset markers no longer move depending on whether **Ignore bugged API data** is on or off. A reset is a physical event that happened at a specific moment — the dashed vertical line is now anchored to that sample regardless of toggle state. With the toggle on, the bugged value at the reset sample is still suppressed (magenta point at the carried-forward last-known value) and the next sample correctly shows the fresh window's first-turn delta.

## [0.57.0] - 2026-05-05
### Fixed
- The chart no longer draws spurious dashed vertical "window reset" lines on bugged-API recovery turns (where the API returns a 100% spike mid-window and then drops back to the real low value). Same fix applies to the **Break on reset limit** option — it stopped breaking the line on every value drop, only on real window flips. Mostly visible with **Ignore bugged API data** off.

## [0.56.0] - 2026-05-05
### Fixed
- 0.55's reset-boundary suppression was too aggressive: the very first sample after every legitimate reset (including past days) was being marked magenta even when the new-window value was perfectly sane (e.g. 0–5%). Suppression now only kicks in when the value at the reset boundary is saturated (≥90%), which is the actual API-glitch pattern we're trying to catch. Sane reset values restore the 0.51 behaviour — windowReset marker, delta = first turn's spend.

## [0.55.0] - 2026-05-05
### Fixed
- **Bugged-API filter now also catches the case where the API returns a glitched 100% on the very turn that crosses a 5h or weekly reset boundary.** Previously such a value slipped through (because a real window reset was simultaneously detected) and poisoned every following sample in the new window — they'd all be drawn at 100% in magenta even though the actual readings were fine. The reset boundary is now treated as a hard slice: the unreliable sample at the reset itself is suppressed, and the first real sample of the new window becomes the genuine "reset point" on the chart with the correct first-turn delta. With **Ignore bugged API data** off, behaviour is unchanged from 0.51.

## [0.54.0] - 2026-05-05
### Changed
- Forecast no longer disappears silently when the last few readings are flat. If the limit isn't trending up (e.g. the same 2% across the last 5 turns), the forecast now draws a tight-dash horizontal line at the current level — labelled `flat, no trend yet` on the main chart panel — so the user sees the forecast is enabled but has nothing to extrapolate. The normal sloped projection still draws as soon as a real upward trend appears.

## [0.53.0] - 2026-05-05
### Changed
- The **Ignore bugged API data** toggle moved from VS Code's standard Settings UI to the sidebar's Settings dropdown, alongside Show USD spent and VS Code skin support — easier to discover and to flip on the fly. The detailed explanation now lives in the row's hover tooltip. Default stays ON.

## [0.52.0] - 2026-05-05
### Added
- New setting **Ignore Bugged API Data** (default on). When Anthropic's rate-limit endpoint returns an obviously impossible value for a window (e.g. `week 100%` mid-window after a string of `0%` readings, with no countdown reset), only that specific window is suppressed and the previous valid value is shown instead — no holes in the timeline. The other window (5h vs week) and the per-turn token counts are unaffected, so token logging and the still-good limit keep updating normally. On the chart panel, suppressed points are drawn in **magenta** and the tooltip explicitly says "last valid (API returned broken data)" for that window. The raw log file is left untouched.

## [0.51.0] - 2026-05-05
### Fixed
- The first turn after a 5h or weekly window reset now shows its spend in the sidebar Last Turn card, the limit-bar delta line, and the status bar. Previously the delta was hidden as "window reset / new window" with no number, even though the chart drew it. The daily summary now includes that turn's spend in the day's total too.

## [0.50.0] - 2026-05-04
### Fixed
- Forecast now ignores stale samples (those carrying forward the previous % after an API rate-limit), so the trend line draws based on real measurements instead of going silent on long flat plateaus.

## [0.49.0] - 2026-05-04
### Fixed
- Chart and tokens-chart settings (Day, Gap, gradients, Forecast, Focus, Y-axis, etc.) no longer reset to defaults when reopening the panel.

## [0.48.0] - 2026-05-03
### Changed
- Marketplace package id renamed from `claude-usage-monitor` to `claude-code-telemetry` (the old id was already taken on the Marketplace and was blocking publish). User-facing settings, commands and saved state are unaffected.

## [0.47.0] - 2026-05-03
### Changed
- License switched from Apache 2.0 to **MIT**. Same permissive spirit, fewer formalities, more recognisable.

## [0.46.0] - 2026-05-03
### Changed
- Renamed to **Claude Code Telemetry** on the Marketplace (the previous "Claude Usage Monitor" name was already taken).
- Marketplace description and README now lead with the open-source side and surface usage forecasts and predicted reset markers more prominently.
- License + GitHub source badges added at the top of the README.

## [0.45.0] - 2026-05-03
### Removed
- Stop hook no longer pops a Windows corner toast on each turn.

## [0.44.0] - 2026-05-03
### Added
- Proper extension icon in the Extensions list and on the Marketplace.

## [0.43.0] - 2026-05-03
### Fixed
- Sidebar now updates immediately after installing the Stop hook from the install button.

## [0.42.0] - 2026-05-03
### Fixed
- Limits chart no longer draws a misleading vertical spike when the 5h or weekly window flips.

## [0.41.0] - 2026-05-03
### Fixed
- Sidebar and status bar no longer show bogus deltas when the usage window resets between fetches; show "new window" instead.

## [0.40.0] - 2026-05-03
### Added
- The bar or pair of points under the cursor is highlighted while a tooltip is showing.

## [0.39.0] - 2026-05-03
### Fixed
- Hover hit-areas no longer trigger tooltips for points far away from the cursor on sparse charts.

## [0.38.0] - 2026-05-03
### Fixed
- Hovering individual bars and points on the charts is no longer a pixel-precision exercise.

## [0.37.0] - 2026-05-03
### Fixed
- Chart tooltip no longer escapes the visible area when hovering near the right or bottom edge.

## [0.36.0] - 2026-05-03
### Changed
- Settings dropdown moved to the bottom of the sidebar.
- Toggling a setting no longer collapses the dropdown.

## [0.35.0] - 2026-05-03
### Added
- Sidebar settings dropdown with toggles for USD annotations and VS Code theme support.

## [0.34.0] - 2026-05-03
### Added
- Per-window cost and per-turn cost in USD shown in the sidebar.

## [0.33.0] - 2026-05-03
### Added
- Optional VS Code theme support for the chart panels (off by default).

## [0.32.0] - 2026-05-03
### Added
- Drag-to-select a range on the limits chart to see the total Δ for both windows over the selection.

## [0.31.0] - 2026-05-03
### Added
- Drag-to-select a range on the tokens chart to see total turns, tokens and USD cost over the selection.

## [0.30.0] - 2026-05-03
### Fixed
- Tokens chart no longer crashes for empty windows.
- Mini tokens chart now scales to actual data instead of being squashed in USD mode.

## [0.29.0] - 2026-05-02
### Added
- Mini tokens chart in the sidebar, mirroring the full tokens panel.
### Changed
- USD is now the default Y-axis mode on the tokens chart.

## [0.28.0] - 2026-05-02
### Fixed
- Tokens chart bars no longer overlap inside dense clusters of turns.

## [0.27.0] - 2026-05-02
### Added
- USD cost mode on the tokens chart (per-turn dollar amounts) using a bundled per-model pricing snapshot.

## [0.26.0] - 2026-05-02
### Added
- Diagnostic invocation log restored on the bundled hook.

## [0.25.0] - 2026-05-02
### Changed
- Bundled hook updated to the canonical version with richer log lines and an optional Windows toast on every Stop event.

## [0.24.0] - 2026-05-02
### Added
- Hook now records per-turn token counts and the model id from the local Claude Code transcript.
- "Update Stop hook to bundled version" command and a sidebar banner when the installed hook is outdated.
- Bundled `pricing.json` and a command to open it.

## [0.23.0] - 2026-05-02
### Changed
- Tokens chart "Focus on data" defaults to ON for new users.
- Adjacent same-coloured bars on the tokens chart no longer merge into one block.

## [0.22.0] - 2026-05-02
### Added
- "Focus on data" option on the tokens chart.

## [0.21.0] - 2026-05-02
### Added
- Tokens chart panel — stacked bars per turn (input / output / cache-write / cache-read).
### Fixed
- Chart updates while the panel is hidden behind another tab; no flash on switch back.

## [0.20.0] - 2026-05-02
### Changed
- Chart visualization now uses a fixed dark palette regardless of the VS Code theme. The rest of the sidebar still follows the theme.

## [0.19.0] - 2026-05-02
### Added
- Sidebar mini chart is clickable and opens the full chart panel.

## [0.18.0] - 2026-05-02
### Added
- Hook diagnostic invocation log and "Show hook invocation log" command.
### Changed
- Smaller `.vsix` package.

## [0.17.0] - 2026-05-02
### Added
- "Focus on data" option on the limits chart.
### Changed
- Mini chart moved to the bottom of the sidebar.
- Adaptive X-axis tick density for arbitrary day windows.

## [0.16.0] - 2026-05-02
### Added
- Mini chart in the sidebar, mirroring the main chart's settings.

## [0.15.0] - 2026-05-02
### Added
- Predicted reset markers on the chart based on the latest sample's countdown.

## [0.14.0] - 2026-05-02
### Added
- "Forecast" option on the chart — linear extrapolation to 100% or window end.

## [0.13.0] - 2026-05-02
### Added
- "Break on reset limit" option (default on).
- Vertical reset markers and day-boundary lines on the chart.

## [0.12.0] - 2026-05-02
### Added
- Configurable gradient colors for both lines, with a "Reset colors" button.
- Chart options persist across reloads.

## [0.11.0] - 2026-05-02
### Added
- Gradient strokes for both chart lines (saturated at low %, faded near 100%).

## [0.10.0] - 2026-05-02
### Added
- Chart line breaks at usage window resets.

## [0.9.0] - 2026-05-02
### Added
- Free-form day-range syntax: `1`, `(N)`, `N1-N2`, etc.
- Inline rules cheat-sheet on parse failure.

## [0.8.0] - 2026-05-02
### Changed
- Replaced today/14-days dropdown with a free-form Days input.
### Added
- "Break line on gap > N h" option.

## [0.7.0] - 2026-05-02
### Added
- Stale-sample handling — chart no longer loses points when the API rate-limits the hook.

## [0.6.0] - 2026-05-02
### Added
- Bundled Stop hook with one-click installer.
- "Install / Remove / Show status" commands for the hook.
- First-activation prompt to install the hook.

## [0.5.0] - 2026-05-02
### Changed
- Major pivot — the extension is now a passive reader of `~/.claude/usage-log.txt`. All HTTP calls live in the Stop hook. Polling and JSONL history removed.

## [0.4.0] - 2026-05-02
### Added
- "Show chart" command opening a chart panel beside the editor.
- "Show plugin log" diagnostic command.

## [0.3.0] - 2026-05-02
### Added
- "Show daily summary" command with per-day spend totals and peaks.

## [0.2.0] - 2026-05-02
### Added
- Two-card "Last Turn" Δ display (5h and weekly).
- Cooldown handling for upstream rate limits.

## [0.1.0] - 2026-05-02
### Added
- Initial release. Sidebar with last-turn Δ and 5h / weekly progress bars; status bar usage summary.
