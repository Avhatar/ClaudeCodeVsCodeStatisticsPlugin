# Changelog

User-visible changes only. For root causes, design decisions and internal mechanics see [DevChangelog.md](./DevChangelog.md).

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

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
