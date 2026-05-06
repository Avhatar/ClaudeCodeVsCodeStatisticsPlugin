# Developer Changelog

Detailed per-version notes — root causes, design decisions, internal mechanics.
For the user-facing summary see [CHANGELOG.md](./CHANGELOG.md).

This file is excluded from the packaged `.vsix` (see `.vscodeignore`) and is not shown on the VS Code Marketplace.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

The entire 0.x range was developed iteratively in a single working session
(2026-05-02) — versions are very granular by design.

## [0.66.0] - 2026-05-06
### Changed
- Weekly forecast trend baseline switched from "last N=5 samples" to "every sample sharing the latest sample's `weekResetsAtIso`" (i.e. the entire current week window). User report: 5-6 turns today plus a few yesterday, week showed `flat — no trend yet`. Cause: the API returns `week %` rounded to one decimal, and a handful of small turns within a single day frequently leaves all 5 most-recent samples reading the same float (e.g. all `14.0%`) → `dy === 0` → `dy <= 0` branch fires → flat label. Yesterday's `12.x%` carried the real signal but never participated. New baseline pulls every prior sample with the same week-reset-at-iso (60s tolerance, matching `RESET_ISO_TOLERANCE_MS`) so any non-trivial change since the start of the current weekly window now drives the trend.
- Implementation: new `pickFirst(fc, mode, getResetIso)` helper inside `drawForecast` (chartView.ts) and `fcLine` (webview.ts mini chart). `mode='windowed'` walks back through `fc` while `isoMs(getResetIso(fc[i]))` stays within tolerance of the latest; `mode='recent'` keeps the prior `fc[fc.length - N]` behavior. Falls back to `recent` (a) when the latest sample's reset_at_iso is null (older log entries pre-hook 0.46), (b) when only one sample sits in the current window — guarantees we still have two distinct points for the slope. The 5h forecast keeps `mode='recent'` because a 5h window doesn't span across yesterday in any useful sense; the windowed treatment would just be the same set most of the time, and on the boundary we'd want recency anyway.
- The flat-branch text label is unchanged. With the wider baseline, true flat (zero net usage during the entire current week window) is now actually rare, which is the desired outcome.
- Two-copy update: same logic in both `src/chartView.ts` (limits chart panel webview, inline JS inside template literal) and `src/webview.ts` (sidebar mini chart, TS body). Per CLAUDE.md multi-copy rule.

## [0.65.0] - 2026-05-05
### Fixed
- Visible chart breakage on the user's first session after hook 0.46 was active: every post-reset sample drew its own line stretching off to the right of the chart. Cause is the API's `resets_at` field — Anthropic returns it with microsecond precision and the sub-second part jitters arbitrarily sample-to-sample even when the underlying window hasn't changed. Sample inspection of [usage-log.txt](C:/Users/Avhatar/.claude/usage-log.txt):
  ```
  18:00:57  resets_at=2026-05-05T23:00:00.619098+00:00
  18:04:21  resets_at=2026-05-05T23:00:00.947540+00:00
  18:07:14  resets_at=2026-05-05T23:00:00.765717+00:00
  18:14:37  resets_at=2026-05-05T23:00:00.395543+00:00
  ```
  All four are the same logical reset moment (23:00 UTC), differing only in microseconds. 0.61's strict `prev.fiveResetsAtIso !== cur.fiveResetsAtIso` string compare treated every transition as a reset. With **Break on reset limit** on, `lineFor` then pushed `M xOf(prevIso) yOf(0) L sample_x sample_y` for each — placing the synthetic zero-crossing at `xOf(23:00)` (far to the right of any sample at 18:xx) and drawing a line back from there. Hence "from each new point a line goes off to the right beyond the chart". With breakOnReset off, the synthetic 0 wasn't inserted (just plain `M sample_x sample_y`), so no garbage — matching the user's observation.
- Fix: replace string equality with parsed-timestamp numeric comparison and a 60-second tolerance. Chosen to match the existing `RESET_EPSILON_MS = 60_000` the parser uses for countdown-based reset detection — same conceptual threshold, applied to the more reliable resets_at field. New `isoMs(iso)` helper added in both [chartView.ts](src/chartView.ts) (inline JS template) and [webview.ts](src/webview.ts) (TS body): parses to ms, returns null on falsy/NaN. `RESET_ISO_TOLERANCE_MS = 60_000` constant alongside in both places.
- Updated three call sites in chartView.ts (reset markers loop, lineFor's knownReset detection, lineFor's synthetic-0 x calculation now uses already-parsed `prevMs` instead of re-parsing) and three matching ones in webview.ts (reset markers loop, pathFor's knownReset, pathFor's synthetic-0 x).
- Trace verification on the user's actual log: `18:00:57` (real reset) — prev (17:50) at 18:00:00.233, cur at 23:00:00.619, diff = 5 hours, > 60s → knownReset=true, synthetic 0 at xOf(18:00) (the prev's resets_at = the just-crossed reset), in-bounds. `18:04:21` vs `18:07:14` (microsecond jitter) — 947ms vs 765ms = 182ms diff, < 60s → knownReset=false, no synthetic point. Chart line draws cleanly through both samples.
- The toggle off case (no synthetic zero-crossing inserted) was already correct, hence the user's "only with breakOnReset on" observation. Off-mode now also benefits from the corrected reset detection — old logic still produced spurious `M`-only breaks every sample but they were invisible because they were at the actual sample position.

## [0.64.0] - 2026-05-05
### Changed
- 0.55-0.63 bugged-API logic was a tangle: `BUGGED_JUMP_THRESHOLD = 50` for mid-window, `RESET_SATURATION_THRESHOLD = 90` for reset-boundary, plus a `pendingFiveResetDelta` / `pendingWeekResetDelta` state to preserve "first turn delta in fresh window" semantics from 0.51, plus a saturation re-check inside the pending branch to handle multi-sample API stalls. Each iteration solved one observed pattern but introduced new edge cases. User cut through it with two deterministic rules covering the actual API failure mode (the API only ever pegs to exactly `100%`, never `97%` or `93%`):
  - **Rule A — at reset:** `ignoreBuggedApiData && cur.five === 100 && fiveReset` → `cur.five = 0`, windowReset stays true (the reset really happened, the marker stays). Forces a hard zero on the chart, guaranteeing at least one zero-valued point at the new window's start regardless of how many subsequent samples the API also bugs.
  - **Rule B — mid-window:** `ignoreBuggedApiData && cur.five === 100 && !fiveReset && prev.five <= PREV_LOW_THRESHOLD` (= 70) → carry forward prev value. Same shape as the old mid-window suppression but tied to exact `=== 100` instead of `|cur-prev| > 50`.
- Removed: `BUGGED_JUMP_THRESHOLD`, `RESET_SATURATION_THRESHOLD`, `pendingFiveResetDelta`, `pendingWeekResetDelta`. Added: `PREV_LOW_THRESHOLD = 70`. Comment block above the loop rewritten to describe the two rules.
- Trace verification on the production log:
  - `13:06 5h=100%` (countdown jump 1h26m → 4h53m, fiveReset=true): Rule A fires. cur.five=0, fiveDelta=0, windowReset=true, fiveBugged=true. Chart shows magenta point at y=0 right at the reset sample, no slope into the new window.
  - `15:08 5h=2%` (next sample, fiveReset=false against carried-forward 4h53m raw — wait actually with new rules we don't carry-forward fiveResetsIn at reset, see below): cur.five != 100, no rule fires. Standard delta computation (cur.fiveDelta from log = `-98%`, kept as-is — pre-existing semantic, unchanged from prior versions).
  - `18:00:57 5h=100%` (fiveReset=true): Rule A. cur.five=0, magenta zero point.
  - `18:04:21 5h=100%` (fiveReset=false, prev.five=0 from rule A on 18:00:57, prev <= 70): Rule B. Carry forward 0. Magenta zero point continues.
  - `18:Nstuff 5h=2%` (eventually): cur.five != 100, no rule. Delta from log applied normally.
  - `07:34 week=100%` (mid-window after string of `0%`, weekReset=false, prev.week=0): Rule B. Carry forward 0. ✓
  - `22:10 5h=5%` (legitimate reset): cur.five != 100, no rule. Standard reset path: windowReset=true, fiveDelta=cur.five=5%. ✓
  - User accidentally hits real 100% in same window (prev=99, cur=100, no reset): prev > 70, neither rule fires. cur.five=100 accepted. ✓ (No false positive on legitimate saturation.)
- Note on `fiveResetsIn` carry-forward: Rule A leaves it raw (the new window's countdown is correct), Rule B carries forward prev's `fiveResetsIn` (mid-window, same window's countdown should be roughly the same anyway — the carry-forward is for safety against any drift). The chart's `prev.fiveResetsAtIso !== cur.fiveResetsAtIso` reset-marker check uses the ISO field which we don't touch in either rule, so chart visualization stays exact.
- Note on the `RESET_EPSILON_MS = 60_000` and the `fiveReset = ...` countdown-based detection: still in place — the parser uses it to set `cur.fiveWindowReset` for non-chart UI (sidebar Last Turn card "new window" label, status bar, daily summary). Chart visualization is heuristic-free per the 0.61 contract; the parser's countdown detection is just a flag for non-chart annotations.

## [0.63.0] - 2026-05-05
### Fixed
- The "two consecutive bugged 100% post-reset" edge case I noted as accepted-limitation in 0.55 actually hit the user today. Production log:
  ```
  17:50:46 5h=47% ↻9m@2026-05-05T18:00:00
  18:00:57 5h=100% ↻4h59m@2026-05-05T23:00:00   ← reset detected, value 100% ≥ 90 → suppress, pending=true
  18:04:21 5h=100% ↻4h55m@2026-05-05T23:00:00   ← pending fires unconditionally → fiveDelta = cur.five = 100%, NOT marked bugged
  ```
  Then every subsequent sample gets compared against prev=100% via mid-window-bugged (`|next - 100| > 50`) and propagates the 100% indefinitely into the new window. Same chain reaction we thought we'd killed in 0.55, just shifted by one sample.
- Fix in [logSource.ts:readAll](src/logSource.ts) pending-branch: instead of unconditionally setting `cur.fiveDelta = round2(cur.five)` and clearing pending, check if `ignoreBuggedApiData && cur.five >= RESET_SATURATION_THRESHOLD` first. If yes, the API is still glitching on this sample too — apply the same suppression as the saturation branch (`cur.five = prev.five`, `cur.fiveDelta = 0`, `cur.fiveBugged = true`, but `cur.fiveWindowReset = false` since the windowReset marker was already consumed by the i-1 sample), and keep `pendingFiveResetDelta = true`. Only when a sane value finally arrives does pending release with the standard "first turn delta in fresh window" semantics. Mirrored on the week side. The 5h/week pending states stay independent.
- Trace verification on the production log:
  - 18:00:57 (cur.five=100, fiveReset=true): main saturation branch fires. cur.five=47% carried, fiveDelta=0, windowReset=true, fiveBugged=true, pending=true. Marker drawn at 18:00 (from `prev.fiveResetsAtIso` ≠ `cur.fiveResetsAtIso`).
  - 18:04:21 (cur.five=100, fiveReset=false against carried prev): NEW pending-saturation path fires. cur.five=47% carried, fiveDelta=0, windowReset=false, fiveBugged=true, pending stays true. No second marker. Magenta point at 47%.
  - Whenever the API recovers (say 18:Nstuff with cur.five=2): pending-sane path fires. cur.five=2 raw, fiveDelta=2 (first-turn delta semantics from the moment of reset), pending=false.
  - All subsequent samples in the new window: regular path, real values flow through unchanged.
- Limitation: if the API returns a sane-but-incorrect value (e.g. it says 50% when reality is 5%) on a post-reset sample, we accept it. The threshold is 90, so anything below that is "trusted enough". No way to distinguish without out-of-band info.

## [0.62.0] - 2026-05-05
### Changed
- 0.61's `LINE_BREAK_GAP_MS = 2 * 3600 * 1000` was a separate hardcoded floor that ANDed (actually ORed) with the existing user-configurable `gapMs` from the **Break line on gap** input — duplicate logic. User pointed out the parameter already exists. Removed the constant from both [chartView.ts:lineFor](src/chartView.ts) and [webview.ts:pathFor](src/webview.ts); `tooFar` is now a single `prev && gapMs > 0 && (p.tsMs - prev.tsMs) > gapMs` like before 0.61.
- Default `gap` lowered from 8h to 2h in [chartLogic.ts:DEFAULT_CHART_SETTINGS](src/chartLogic.ts) — 2h is the right floor for the new heuristic-free reset visualization (old log entries without resets_at ISO need a tighter break to avoid drawing slopes across unknown resets, and 2h matches typical 5h-window usage patterns where samples land every few minutes when the user is active). HTML default attribute on the gap input in [chartView.ts](src/chartView.ts) bumped from `value="8"` to `value="2"` so the chart's "Reset" button restores 2 instead of 8.
- Tokens chart `DEFAULT_TOKENS_CHART_SETTINGS.gap` left at 8 — the tokens chart has no resets to draw across, and a tighter default would over-break for users who like long continuous spend curves. Easy follow-up if asked.
- Existing globalState saves of `gap = 8` from earlier installs are preserved (we layer saved settings over defaults). New installs and "Reset" clicks get 2.

## [0.61.0] - 2026-05-05
### Changed
- User decision: chart reset visualization should use only API ground truth, no heuristics. The countdown-based "countdown went UP" detection is fine for non-chart annotations (sidebar Last Turn `new window` label, status bar, daily summary spent calculation), but the chart's dashed reset marker and synthetic zero-crossing must be drawn ONLY from the API's `resets_at` timestamp returned per-sample. For samples that don't carry that ISO (anything written by hook < 0.46), draw nothing reset-specific; rely on a 2-hour time-gap break for visual separation.
- **Hook 0.46** ([media/hooks/claude-usage-monitor-hook.js](media/hooks/claude-usage-monitor-hook.js)): line format extended from `↻4h53m` to `↻4h53m@<resets_at_iso>`. The `@<iso>` part is appended unconditionally when `limits.fiveResetsAt` / `limits.weekResetsAt` is present. The humanized countdown is kept for human readers grepping the log file directly. ANSI codes around the countdown segment unchanged. `HOOK_VERSION` bumped to 0.46.0; the `v=...` comment at the top of the file bumped to match. Plugin's bundled-hook detection compares these strings — installs of the new plugin will offer "update hook" to users with hook ≤0.45 still registered. Hook 0.46 also contains the same code paths as 0.45 for everything else (token sums, model picking, `appendLog`, ANSI strip).
- **Parser** ([logSource.ts:parseLine](src/logSource.ts) and `ParsedSample`): two new fields `fiveResetsAtIso` / `weekResetsAtIso` (string | null). Regex extended:  `↻(?<h5r>[^\s@]+)(?:@(?<h5i>\S+))?` (and same for week). Old format `↻4h53m` matches the first group with no second; new format `↻4h53m@<iso>` matches both. `parseLine` populates the new fields from groups `h5i` / `wki`; both stale-sample fallback and full-line success paths set them (null for old/stale entries). Stale-sample carry-forward at the top of `readAll` was extended to copy `fiveResetsAtIso` / `weekResetsAtIso` alongside the existing `fiveResetsIn` / `weekResetsIn`.
- **Reset-bugged saturation suppression** (the 0.58 path) leaves `cur.fiveResetsAtIso` raw from `parseLine` — the API gave us the ISO truth, only the % value is suspect. Same for the mid-window-bugged path. So even when the bugged-API filter rewrites `cur.five` and the countdown, `fiveResetsAtIso` stays usable for the chart's reset detection.
- **ChartTimePoint** ([chart.ts](src/chart.ts)): added `fiveResetsAtIso` / `weekResetsAtIso` mirrors of the new ParsedSample fields, populated in `prepareChartData`.
- **Chart panel reset markers** ([chartView.ts](src/chartView.ts)): the dashed-vertical loop at i ≥ 1 now compares `prev.fiveResetsAtIso` against `cur.fiveResetsAtIso`. If both are present and differ, the reset moment IS the prev sample's resets_at — direct API fact, not derived. `xOf(new Date(prev.fiveResetsAtIso).getTime())` for placement. Falsy-or-equal pair → no marker. Same for week. The countdown-based `resetMomentMs` helper from 0.59 is gone.
- **Chart panel line drawing** ([chartView.ts:lineFor](src/chartView.ts)): signature changed from `(getY, getReset, getCountdown, windowDurMs, color)` to `(getY, getResetIso, color)`. Gap detection is now two-tier: user `gapMs` setting (existing) PLUS hard `LINE_BREAK_GAP_MS = 2 * 3600 * 1000`. Either triggers `tooFar`. Known-reset detection is `prevIso && curIso && prevIso !== curIso`. When known + not too far, the new segment's start uses `new Date(prevIso).getTime()` for the zero-crossing's x — exact, no heuristic. The old samples without ISO take the simple `tooFar ? M : L` path — no reset visualization, just gap-driven separation.
- **Sidebar mini chart** ([webview.ts:pathFor](src/webview.ts)): mirrored signature change and logic. Same `LINE_BREAK_GAP_MS = 2 * 3600 * 1000` constant. Reset markers loop also rewritten to compare ISO.
- **Migration**: existing `~/.claude/usage-log.txt` keeps working — old lines parse as before with `fiveResetsAtIso = null`. As soon as hook 0.46 takes over (after user clicks "Update hook"), new lines carry the ISO and start showing precise reset visualizations. No log rewrite or backfill — gradual transition.
- Trace verification: `13:06 5h=100%` reset case (post-hook-0.46): prev (10:03) `fiveResetsAtIso = T1`, cur (13:06) `fiveResetsAtIso = T1 + 5h`. Different → marker drawn at T1 (the EXACT 5h reset moment, not approximated from `↻4h53m → ↻1h26m`). Zero-crossing at T1 with breakOnReset on. `08:16 week=2%` recovery from bugged 100% (no actual reset, weekResetsAtIso unchanged at the same T_week through 07:34/07:59/08:10/08:16): prev.weekResetsAtIso === cur.weekResetsAtIso → no marker drawn. Mid-window bugged value still suppressed by parser, but no false reset marker. Old log section entirely without ISO: zero markers, only 2h-gap breaks where applicable.

## [0.60.0] - 2026-05-05
### Changed
- 0.59 left a slope connecting each window-reset's last pre-reset sample to the synthetic (reset_moment, 0) zero-crossing — `... L prev L rX rY [M/L] rX rY L cur ...`. User flagged this as wrong: the old window's line shouldn't extend past its last sample into territory that belongs structurally to the new window. Between the last pre-reset sample and the reset moment, we have no information about the old window's value, and connecting prev to the boundary fakes one.
- Refactor in [chartView.ts:lineFor](src/chartView.ts) and [webview.ts:pathFor](src/webview.ts): the reset-handling branch now ALWAYS starts a fresh segment with `M` (move, no preceding L from the old segment). The old segment naturally terminates at the prev sample. Two sub-cases for the new segment's first point:
  - `breakOnReset` on (default): `M (rX, rY=0) L (cur.x, cur.y)` — the new window's line begins at its structural zero-crossing and rises to the first sample.
  - `breakOnReset` off: `M (cur.x, cur.y)` — no synthetic zero-crossing; the new window's line begins directly at its first sample.
- `breakOnReset` no longer "breaks" the line in the old sense (it always breaks now — that's structurally correct). Repurposed: it controls whether the new window's line VISUALIZES the structural zero-crossing or not. Renaming the setting was considered and rejected — the existing label "Break on reset limit" still reads correctly for the on-state, the off-state is a tighter visualization not a "no break".
- Reset markers (dashed verticals) and predicted-reset markers unchanged from 0.59 — both already use `resetMomentMs` and don't depend on cross-window line connections.

## [0.59.0] - 2026-05-05
### Changed
- Reset visualization rebuilt around a structural insight from the user: at the moment of any window reset, the value is by definition 0% — a fresh window starts at zero, regardless of what the API returns for the first sample after. So the chart curve must pass through (reset_moment, 0). The Stop hook fires a few minutes after the actual reset (the API rate-limit endpoint isn't called more frequently), so the first post-reset sample sits at e.g. `5h=2%` with `↻4h53m` countdown. True reset moment = `sample.tsMs - (windowDurMs - parseDur(countdown))`.
- New helper `resetMomentMs(sample, countdownStr, windowDurMs)` and constants `FIVE_HOUR_MS = 5*3600*1000`, `WEEK_MS = 7*86400*1000` added in two places: the inline JS template inside [chartView.ts](src/chartView.ts) (panel) and the TS body of [webview.ts](src/webview.ts) (sidebar mini). `parseDur` was already present in both.
- Dashed vertical reset markers in both views now drawn at `xOf(resetMomentMs(cur, cur.fiveResetsIn, FIVE_HOUR_MS))` (and same for week) instead of `xOf(cur.tsMs)`. So the marker sits at the actual reset moment, typically a few minutes left of the sample circle.
- Line drawing (`lineFor` in chartView, `pathFor` in webview) inserts a synthetic zero-crossing on every windowReset transition. SVG path goes `... L (rX, rY=0) [breakOnReset ? M : L] (rX, rY=0) L (sample_x, sample_y) ...`. Same x for both segments — the line always passes through 0 at the reset moment. With breakOnReset on, the visual emphasizes the discontinuity (the M creates a path break, but since both ends touch (rX, 0) the visual is continuous through that point); with it off, fully continuous L through the same point. Either way the curve hits zero at the reset.
- `pathFor` / `lineFor` signatures extended with `getCountdown` + `windowDurMs`. Call sites updated in both files.
- Behavioural note: a windowReset sample where the prev sample is too far back (`tooFar` per gap setting) skips the synthetic 0-crossing and falls through to the standard 'M' break. Avoids drawing a giant zero-line across a multi-day chart gap.
- Test cases verified: `13:06 5h=100%` reset (countdown 1h26m → 4h53m, both toggle states): synthetic 0 at ~12:59 between 10:03 and 13:06. `22:10 5h=5%` legit reset: synthetic 0 a few minutes before 22:10. `06:38 week=0%` week reset: synthetic 0 a few minutes before 06:38. All produce a clean drop-to-zero in the chart, marker dashed line aligned with the zero crossing.

## [0.58.0] - 2026-05-05
### Fixed
- 0.55-0.57 reset-bugged path moved the `fiveWindowReset` flag from the actual reset sample (where the parser detected the countdown jump) to the next real sample via a deferred `pendingFiveReset` boolean. Result: with **Ignore bugged API data** ON the dashed vertical reset marker on the chart sat at sample i+1, with it OFF it sat at sample i — same physical event drawn at two different x positions depending on toggle state. User flagged this as wrong: a reset happened at one moment in time and shouldn't visibly shift based on parser configuration.
- Refactor in [logSource.ts:readAll](src/logSource.ts) loop: split the deferred state into "delta-only" (`pendingFiveResetDelta`/`pendingWeekResetDelta`) instead of "delta + windowReset flag". On the suppressed reset sample, KEEP `fiveWindowReset = true` and KEEP `fiveResetsIn` raw (so chart's dashed marker, the breakOnReset line break, AND the predicted-next-reset calculation in chartView.ts/webview.ts that reads `lastValid.fiveResetsIn` all reflect the actual reset moment); only `cur.five` is carried forward and `cur.fiveDelta = 0`. The next real sample inherits the 0.51 "first turn delta in fresh window" semantics via `cur.fiveDelta = round2(cur.five)` from the pending state, then clears it.
- Removed need for the carry-forward of `cur.fiveResetsIn = prev.fiveResetsIn` on the suppressed reset sample. Previously this carry-forward was load-bearing — without it, on the next iteration the parser would see `prev.fiveResetsIn` (carried, e.g. 1h26m) vs `cur.fiveResetsIn` (raw new-window, e.g. 2h51m) and re-detect a reset, cascading suppression forever. With windowReset staying on i, the cascade no longer happens because i+1's `cur.fiveResetsIn` is compared against i's RAW 4h53m countdown, which is only decreasing — no false reset detected.
- Trace verification on the production log:
  - Toggle OFF, `13:06`: fiveReset=true, fourth branch fires, `windowReset=true, fiveDelta=100%`. Marker at 13:06.
  - Toggle ON, `13:06`: fiveReset=true, cur.five=100 ≥ 90, suppression branch fires, `cur.five=28% (carried), fiveResetsIn='4h53m' (raw), windowReset=true, fiveDelta=0, fiveBugged=true, pendingFiveResetDelta=true`. Marker at 13:06 (same position). Magenta point at 28% level.
  - Toggle ON, `15:08`: pending fires, `cur.fiveDelta=cur.five=2%`. cur.fiveWindowReset stays false. No second marker drawn — chart sees only 13:06 as the reset point.
  - All previously-affected legitimate resets (`22:10 5h=5%`, `06:38 5h=2%`, `06:38 week=0%`) take the fourth (legitimate-reset) branch in both toggle states — windowReset on the reset sample with delta=cur.value. Same position both ways.
- Mid-window bugged path unchanged from 0.56 (`!fiveReset && |cur-prev| > BUGGED_JUMP_THRESHOLD` carries forward, `windowReset=false`).

## [0.57.0] - 2026-05-05
### Fixed
- Removed the legacy "value dropped below prev" trigger from chart reset-marker drawing and from `breakOnReset` line-break logic, in both [chartView.ts](src/chartView.ts) (panel) and [webview.ts](src/webview.ts) (sidebar mini chart). Pre-existing dual trigger was `cur.five < prev.five || cur.fiveWindowReset` (and same for week). The drop heuristic predates the parser-set `windowReset` flag (added when countdown-based detection landed) and has been redundant ever since — but stayed because it was once the only way to catch resets where new-window first reading was below old-window last reading. Now wrong: with **Ignore bugged API data** off, raw API readings include mid-window 100% spikes (e.g. `07:34 week=100%` after a chain of `0%`) that recover at the next sample (`08:16 week=2%`). The recovery looks like a value drop → legacy heuristic drew a dashed reset marker AND broke the line at that sample. Same problem on 5h: `15:08 5h=2%` after `13:06 5h=100%` raw drew a second dashed marker on top of the legitimate one already drawn at 13:06 (where parser correctly flagged windowReset via countdown jump 1h26m→4h53m).
- Sole trigger now is `cur.fiveWindowReset` / `cur.weekWindowReset`. Parser sets these whenever the countdown went up by > RESET_EPSILON_MS — covers both directions of the new-window-first-value relative to old-window-last-value, regardless of whether the value increased or decreased. Genuine resets that the parser misses (e.g. unparseable countdown strings) won't draw a line, but those are corner cases and the earlier fallback was doing more harm than good in real usage.
- Comment in [chartView.ts](src/chartView.ts) and [webview.ts](src/webview.ts) updated to call out the rationale (false positive on bugged-API recovery) so future-us doesn't re-introduce the heuristic.

## [0.56.0] - 2026-05-05
### Fixed
- 0.55 over-suppressed: any sample where countdown went up was unconditionally treated as bugged in [logSource.ts:readAll](src/logSource.ts), so every legitimate reset boundary in the entire history got carry-forward + magenta + deferred-reset-marker. Visible result: every previous-day's first-post-reset point sat at the OLD window's last value in magenta on the chart, and the line break shifted one sample later than the real reset moment. Triggered by user feedback after the 0.55 install.
- Fix: split the reset-bugged check from the reset-detected check. Suppression now requires both `fiveReset && cur.five >= RESET_SATURATION_THRESHOLD` (and same for week). New constant `RESET_SATURATION_THRESHOLD = 90` documented inline. Picked at 90 because the observed glitch always pegs at exactly 100%, while real first-turns-of-fresh-window cluster in 0-10% historically (highest seen: ~30% on a single mega-prompt). 90 leaves margin both ways — it catches the 100% / `>=95%` saturated patterns and refuses to false-positive on heavy first turns. The mid-window branch retains its existing `BUGGED_JUMP_THRESHOLD = 50` against `Math.abs(cur - prev)`.
- The mid-window branch's previously-implicit `!fiveReset` guard is now explicit (`ignoreBuggedApiData && !fiveReset && Math.abs(...)>50`). Without that guard, a legitimate big-drop-at-reset (e.g. prev=53%, cur=0% on a fresh week) would have hit the third branch with `|0-53|=53 > 50` and been suppressed — same regression in a different shape. Same explicit guard added on the week side.
- Trace verification against the production log: `13:06 5h=100%` at reset still suppressed (cur.five=100 ≥ 90), `15:08` becomes deferred-windowReset point with `delta=2%` (correct). `22:10 5h=5%` legit reset preserved (cur.five=5 < 90, fourth branch fires, windowReset=true, delta=5%). `06:38 5h=2%` legit reset preserved. `06:38 week=0%` legit reset preserved despite |0-53|=53 jump (third branch's `!weekReset` guard now blocks it). `07:34 week=0%→100%` mid-window glitch still suppressed (third branch, weekReset=false, jump=100>50).
- Two-pass deferred-reset state (`pendingFiveReset`/`pendingWeekReset`) from 0.55 unchanged — only triggers on the saturated path now.

## [0.55.0] - 2026-05-05
### Fixed
- **Reset boundary now treated as a hard slice for the bugged-API filter.** Real-world failure: at `2026-05-05T13:06Z` the 5h countdown legitimately flipped (`↻1h26m → ↻4h53m`, i.e. window N→N+1) AND the same sample carried `5h=100%`. Under 0.52's logic, `fiveReset=true` short-circuited the `Math.abs(cur.five - prev.five) > 50` guard (`!fiveReset && …`), so the bugged 100% slipped through as a legitimate fresh-window starting value. The next sample at `15:08Z` reported the actual fresh-window value `5h=2%` with `↻2h51m` (countdown decreasing — same window N+1, no reset). Compared against the now-poisoned `prev.five = 100`, the parser saw `|2−100|=98 > 50` with no reset → flagged `cur` as bugged, carried forward `100%` and `↻4h53m` from the corrected prev. Every subsequent sample in N+1 (`15:13`, `15:43`, `15:57`, `16:01`, `16:07`, `16:18`, `16:30`) repeated the same comparison against the ever-carried-forward `100%` — chain reaction, every 5h point in the new window drawn at 100% in magenta, only the chart line was visibly wrong.
- **Fix in [logSource.ts:readAll](src/logSource.ts) loop.** Reset detection now ALSO triggers `bugged` suppression (when the toggle is on) — the reset-point sample's value is unreliable and gets the same carry-forward treatment as a mid-window spike. To prevent the suppression from cascading (the carried-forward old-window countdown would re-trigger reset detection against the next real sample's countdown indefinitely), a per-window `pendingFiveReset` / `pendingWeekReset` boolean is held across loop iterations: when we suppress at a reset boundary, we set pending=true and on the very next iteration we treat the current sample as the windowReset start (`fiveWindowReset=true, fiveDelta=cur.five`) regardless of countdown comparison, then clear pending. This shifts the visible windowReset marker from the unreliable boundary sample to the first trustworthy post-reset sample. Toggle-off path is unchanged — the new logic gates entirely on `ignoreBuggedApiData`, so flipping it off restores 0.51's "first sample after reset = first turn delta in new window" semantics.
- Trace verification with the production log: `13:06` is now suppressed (`five=28%` carried from `10:03`, magenta marker, `windowReset=false`); `15:08` becomes the genuine reset point (`five=2%`, `fiveDelta=2%`, `windowReset=true`, line break visible on chart); `15:13`+ proceed normally with raw values `2%, 2%, 4%, 10%, 12%, 14%, 18%, 19%`. The pre-existing week-side filter (`07:34` `week=0%→100%` mid-window then carried-forward zeros until `08:16` `week=2%`) is unchanged — that case was always within-window and still hits the third branch.
- Limitation accepted: if the API returns a bugged value on TWO consecutive samples after a reset, only the first (the reset boundary itself) is suppressed; the deferred-windowReset branch on sample i+1 unconditionally trusts `cur.five`. Not seen in the wild — the 100%-at-reset pattern shows up once per reset incident, not twice. Revisit if the API gets worse.

## [0.54.0] - 2026-05-05
### Changed
- Forecast `dy <= 0` branch in [chartView.ts:drawForecast](src/chartView.ts) and [webview.ts:fcLine](src/webview.ts) no longer returns early. Splits the existing guard: `dt <= 0 || yLast >= 100` still aborts, but `dy <= 0` (flat or noisy-decreasing within the same window) now draws a horizontal line from `last.tsMs` to right edge `toMs` at `yLast`, with a tighter `2 4` dash pattern (panel) / `1 3` (mini) and reduced opacity to visually distinguish from a real upward projection. Panel adds an SVG `<text>` annotation `<window> — flat, no trend yet` near the right end in `var(--muted)`. Mini chart has no room for a label, so the dash-pattern alone carries the signal. Trigger: 0.52 bugged-API filter exposed the case — when all of the last 5 valid week samples sit on the same percent (e.g. 2%), the existing `dy <= 0` guard silenced the line and the user couldn't tell whether the forecast was disabled, broken, or just had no slope. Reasoning for "flat at yLast" rather than e.g. last-known-positive-slope: an honest "we don't know yet" beats a stale slope from earlier in the window. The line will switch back to the sloped projection automatically the moment any sample-to-sample increase appears.

## [0.53.0] - 2026-05-05
### Changed
- Moved `ignoreBuggedApiData` from VS Code workspace settings (`package.json` → `configuration.properties`) to `ChartSettings` globalState, alongside `showUsdSpent` and `vscodeSkin`. Trigger: user expected the toggle in the sidebar's Settings dropdown they already use — Settings UI is a different surface and a power-user habit, less discoverable. Changes: extended `ChartSettings`/`DEFAULT_CHART_SETTINGS` in [chartLogic.ts](src/chartLogic.ts) with `ignoreBuggedApiData: boolean` (default `true`); extended `toggleSetting()` key union in [extension.ts](src/extension.ts) to accept `'ignoreBuggedApiData'` and force a `refresh()` (not just `panelProvider.update`) on flip because changing the parser flag invalidates `currentSamples`; new `claudeUsage.toggleIgnoreBuggedApiData` command registered the same way as the other two (no `package.json` `commands` entry needed since it's only invoked via `command:` URL from the webview); new sidebar row in [webview.ts:renderSettings](src/webview.ts) using the existing `row()` helper, with the multi-paragraph rationale in the `title` attribute as a hover tooltip; `getReadOpts()` now reads from `getSettings()` instead of `vscode.workspace.getConfiguration`. Removed the `claudeUsage.ignoreBuggedApiData` property from `package.json` `configuration` and the matching `affectsConfiguration` listener — single source of truth is globalState now.

## [0.52.0] - 2026-05-05
### Added
- New setting `claudeUsage.ignoreBuggedApiData` (default `true`) plus parser-side filter for impossible API readings. Triggered by an observed real-world incident: after a weekly window reset at `2026-05-05T06:38Z`, the `oauth/usage` endpoint returned `week=0%` consistently for ~30 minutes, then on the `07:34:51Z` turn flipped to `week=100%` (with `↻6d20h` countdown unchanged — same window), and stayed at `100%` on the next call too. Hook invocation log confirmed the API itself returned `wk=100.0%` — the hook is a transparent passthrough (`pickWindow` in [media/hooks/claude-usage-monitor-hook.js](media/hooks/claude-usage-monitor-hook.js) reads `utilization` / `percent_used` / `percentage` / `used÷limit` straight off the JSON and writes it verbatim), so this is squarely an upstream API issue, not a hook bug.
- Filter implementation in [logSource.ts:readAll](src/logSource.ts) is **per-window**, not per-sample. After the existing carry-forward / window-reset detection runs, each consecutive sample pair is checked for a >50 percentage-point jump in 5h **or** week with no countdown reset; the offending window is suppressed independently. If `fiveBugged`: `cur.five`/`cur.fiveResetsIn`/`cur.fiveDelta`/`cur.fiveWindowReset` are reset from `prev` and `cur.fiveBugged = true`. If `weekBugged`: same on the week side. The other window, the token counts (in/out/c+/c-/model) and the `cur.stale` flag are deliberately left alone — they came from a different field of the API response or from the local transcript and are still valid. The raw log line is also untouched; only the in-memory parsed values are corrected so forensics on `~/.claude/usage-log.txt` remain accurate.
- Threshold of 50 p.p. picked deliberately: largest legitimate single-turn deltas observed historically are <10 p.p., so 50 leaves a wide margin while catching the 100% case (and any future 60-100% bogus readings). Filter is a no-op for jumps ≥ this threshold that *do* coincide with a window reset (countdown went up) — those are legitimate.
- Two new boolean fields `fiveBugged` / `weekBugged` on [logSource.ts:ParsedSample](src/logSource.ts) and [chart.ts:ChartTimePoint](src/chart.ts), forwarded to webviews via `prepareChartData`. The 0.50 forecast-stale-skip is extended into a per-window filter: `fcVisibleFive = visible.filter(p => !p.stale && !p.fiveBugged)` and `fcVisibleWeek = visible.filter(p => !p.stale && !p.weekBugged)`, applied independently to each forecast line in both [chartView.ts](src/chartView.ts) (panel) and [webview.ts](src/webview.ts) (sidebar mini chart). Daily summary in [history.ts:summarizeByDay](src/history.ts) needs no change: `weekDelta = 0` on a bugged sample doesn't add to `weekSpent` (only `delta > 0` accumulates) and doesn't trip the reset branch (`weekWindowReset = false`). Sidebar/status-bar Last Turn rendering is automatically correct because the bugged window is now `cur.value = prev.value, delta = 0` while tokens stay original.
- Wiring: new `ReadOptions` interface exported from [logSource.ts](src/logSource.ts), threaded through `readAll`/`readLatest`. New `getReadOpts()` helper in [extension.ts](src/extension.ts) reads the setting and is passed to all 6 call sites. Config-change listener now also reacts to `claudeUsage.ignoreBuggedApiData` (refresh + push to chart/tokens panels) so flipping the toggle in Settings updates the UI without a reload. Setting uses `markdownDescription` so the Settings UI tooltip renders formatted multi-paragraph guidance explaining the API's behaviour, the passthrough nature of the hook, and the forensics-preservation tradeoff. Limitation accepted: a bogus value on the *first* sample after a legitimate reset (where countdown went up so the >50 jump check is skipped) is not currently filtered. Not seen in the wild yet; revisit if it shows up.
- Visual call-out for suppressed values on the limits chart panel: per-window circle fill switches from the `#fiveGrad`/`#weekGrad` linear gradient to `#e040ef` (magenta) when `fiveBugged`/`weekBugged` is true. Hover tooltip changes the affected window's row from `5h: 7.0% (+3.0)` to `5h: 7.0% · last valid (API returned broken data)` in magenta, while the unaffected window keeps its normal `b`-tagged percent + delta. Sidebar mini chart and tokens panel don't render individual points, so no styling change there — the carry-forward plateau in the line is the visible signal.

## [0.51.0] - 2026-05-05
### Fixed
- The first turn after a window reset disappeared from the sidebar. The progress bar correctly showed the new percent (e.g. `5%`), but the Last Turn card said `window reset / new window` with no number, the bar's delta line said `new window — Δ vs previous fetch is across windows, hidden`, and the status bar showed `5% (reset)`. The chart drew the spend correctly because it draws raw `cur.five` per sample. Root cause: when [logSource.ts](src/logSource.ts) detects a window flip via `↻` countdown going UP, it set `cur.fiveDelta = null` (and same for week) on the theory that `cur% - prev%` across windows is meaningless. That's true for the cross-window subtraction, but the in-new-window delta IS recoverable: at the reset moment the new window started at `0%`, the hook fires once per Stop event, so the first sample after a detected reset reflects exactly one turn's consumption — `cur.five` itself. Fix: parser now sets `cur.fiveDelta = round2(cur.five)` (and `cur.weekDelta = round2(cur.week)`) when the corresponding `windowReset` flag fires; the flag is unchanged so chart line-break and reset-marker logic keeps working.
- Sidebar surfaces updated to show the recovered number while still flagging the reset: [webview.ts:turnCard](src/webview.ts) checks `delta == null` first, falls back to "window reset" only if there's truly nothing to show; otherwise it renders the normal `+X%` with a `new window` subtitle and a tooltip explaining what the number means. [webview.ts:renderBar](src/webview.ts) writes `Δ +X% in new window (after reset)` instead of hiding the line.
- Status bar [extension.ts:fmtSeg](src/extension.ts) now writes `5% (+5% new)` instead of `5% (reset)`; tooltip via new `turnLine()` helper renders `Last turn (5h): **+5.00%** _(in new window after reset)_`.
- [history.ts:summarizeByDay](src/history.ts) was skipping the post-reset turn from `fiveHourSpent` / `weekSpent` (it took the `fiveWindowReset` branch and incremented only the resets counter). With the new semantic the reset branch also adds the positive delta into the day's spend total, so the daily summary's "5h spent" no longer under-counts whenever the day spans a reset.
- [chartView.ts:updateSelInfo](src/chartView.ts) selection-summary hint changed from "negative delta is real" to "Δ counts the new-window starting spend" — the old wording was a workaround for the now-disappeared case where reset samples contributed zero to the sum.

## [0.50.0] - 2026-05-04
### Fixed
- Forecast extrapolation included stale samples in its "last 5" window. The parser fills stale rows by carrying forward the previous valid `five`/`week` verbatim, so any stale point reads identical to the one before it. Five stale samples in a row would push `dy = yLast - yFirst` to exactly 0, hitting the `dy <= 0` guard and silencing the forecast — exactly the behaviour the predicted-reset-marker code already guards against by walking back to the last non-stale sample. Now both the limits chart panel ([chartView.ts](src/chartView.ts)) and the sidebar mini chart ([webview.ts](src/webview.ts)) compute forecast over `visible.filter(p => !p.stale)` instead of raw `visible`. Main line, points, and reset markers still use the full `visible` array — stale points keep the timeline continuous (a flat plateau where the API was unavailable is the intended visual). Only the slope calculation is filtered.

## [0.49.0] - 2026-05-04
### Fixed
- Chart and tokens-chart settings reset to HTML defaults on every panel open. Root cause: each `vscode.window.createWebviewPanel` call produces a fresh webview whose `acquireVsCodeApi().getState()` returns `null`. The script previously read only that per-webview state, fell back to HTML defaults, then immediately called `persist()` — which posted those defaults to the extension and clobbered `globalState[claudeUsage.chartSettings]` (and `…tokensChartSettings`). The next render read the now-default globalState, so the user's saved settings were lost on every open. Two changes: (1) `renderChartHtml` and `renderTokensHtml` now take the saved `ChartSettings` / `TokensChartSettings` and bake them into the script as a JSON literal `const initial = …`; the script applies `initial` to the inputs first, then layers `vsApi.getState()` on top so per-panel edits during a session still win immediately. (2) Removed the eager initial `persist()` call in both views — defaults are seeded from globalState at render time, so the only writes that hit globalState now are user-driven. The HTML `value="…"` attributes still carry the factory defaults so the chart's "Reset colors" button (which reads `getAttribute('value')`) restores the original palette rather than the user's last-saved colours. No data-flow changes — `postMessage({type:'settings'/'tokenSettings'})` still mirrors edits to globalState for the sidebar mini chart.

## [0.48.0] - 2026-05-03
### Changed
- `name` in `package.json` switched from `claude-usage-monitor` to `claude-code-telemetry`. The Marketplace publish flow rejected the old id with "extension 'claude-usage-monitor' already exists" — apparently the unique key is the `name` field (not just `publisher.name`), and someone else holds it. The `displayName`/branding rename in 0.46 didn't move this field, so we have to do it now to actually publish. Everything else that's user-state-relevant — `claudeUsage.*` settings prefix, all command ids, the `claudeUsage` activitybar viewContainer id, the `claudeUsage.panel` view id, the `claudeUsage.chartSettings` / `claudeUsage.tokensChartSettings` / `claudeUsage.setupPromptDeclined` / `claudeUsage.settingsOpen` globalState keys, and `claudeUsage.logPath` — stays untouched, so existing local installs keep their settings and their hook registration. The only on-disk side-effect: VS Code installs us under a new extension folder (`Avhatar.claude-code-telemetry` instead of `Avhatar.claude-usage-monitor`), so the previous local install is now an orphan to uninstall by hand. The repo directory on disk (`x:\Projects\VsCodePlugins\claude-usage-monitor\`) is unrelated to either id and stays as-is.

## [0.47.0] - 2026-05-03
### Changed
- License switched from Apache 2.0 to **MIT**. Same permissive intent (commercial use, modification, redistribution all allowed; only requirement is preserving the copyright notice). MIT is shorter, more recognisable on shields.io / Marketplace, and avoids Apache 2.0's formalities (per-file change notes, NOTICE file). `LICENSE` rewritten with the canonical MIT text, copyright `2026 Timofei Nikitchenko`. `package.json` gained a `license: "MIT"` SPDX field for npm/Marketplace tooling. Both README badges flipped to green MIT. Sole-author relicensing — no contributor sign-off needed.

## [0.46.0] - 2026-05-03
### Changed
- `displayName` switched from "Claude Usage Monitor" to "Claude Code Telemetry". The original name was already published by another extension on the Marketplace, which would muddy search results. Internal ids untouched: `name: claude-usage-monitor`, `claudeUsage.*` settings prefix, `claudeUsage.panel` view id, all command ids, the activity-bar title, and globalState keys all stay as-is so existing local installs keep their state.
- `description` field now leads with "Open-source" and lists the headline features (predicted resets and usage forecasts alongside limits/tokens/USD). This is the line shown under the extension name in Marketplace search results and the Extensions panel, so it carries a lot of weight.
- Both READMEs (`README.md` and `README.marketplace.md`) gained a badges row at the top — Apache 2.0 license + GitHub source-and-issues — and the tagline was reworked to surface forecast and predicted-reset alongside limits/tokens/USD. The "open-source for friends and coworkers" provenance line stays as the third paragraph. Engineer README also gains a one-line note that the rename is display-only (internal ids stay).

## [0.45.0] - 2026-05-03
### Removed
- Bundled hook no longer fires a Windows toast on Stop. Dropped `showToast`,
  `buildToastTitle`, `buildToastLine1`, the `child_process.spawnSync`
  import, and the `showToast(...)` call site at the end of `main()`. The
  `~/.claude/hooks/show-toast.ps1` script (if previously dropped in by the
  user) is now dead and can be deleted by hand — the hook never references
  it anymore. `HOOK_VERSION` bumped to `0.45.0` so the plugin's version-
  mismatch banner offers an update from older v0.26 installs and overwrites
  the toast-bearing copy on disk.

## [0.44.0] - 2026-05-03
### Added
- Extension icon (`media/icon.png`) wired up via the top-level `icon` field
  in `package.json`, so the entry in the Extensions list and on the
  Marketplace now shows a proper logo instead of the default placeholder.
  The pre-existing `media/icon.svg` continues to serve as the activity bar
  view container icon — these are two separate slots.

## [0.43.0] - 2026-05-03
### Fixed
- Sidebar now self-updates after the user installs the Stop hook from the
  "Install hook" button. Previously the toast confirmed success but the
  sidebar stayed on the "Install hook" prompt until something unrelated
  (window focus change, manual refresh) triggered a re-render — the
  watcher had returned early during activation because the log file
  didn't exist yet, so nothing was listening when the hook eventually
  created it. `startWatcher` now falls back to watching the parent
  directory when the log file is absent and rebinds to the file the
  moment it appears, and `doSetupHook` explicitly restarts the watcher
  after a successful install. The sidebar also passes `hookRegistered`
  into `ViewState`: when the hook is wired up but the log hasn't been
  written yet, the sidebar shows "Hook installed — waiting for the first
  Claude Code turn" instead of pushing the user back to the install
  button they just clicked.

## [0.42.0] - 2026-05-03
### Fixed
- Limits chart and sidebar mini chart now break the line at parser-flagged
  window resets, not just where the value visibly drops. The 0.41 fix
  hid the misleading Δ number, but the chart itself still drew a
  continuous line up to a stray 100% spike when the new window's first
  reading was higher than the previous window's last (e.g. 44% then
  100% at the 5h flip). Both panels also draw a dashed reset marker on
  windowReset samples so the visual cue matches a "value-dropped"
  reset. Selection summary on the limits chart also recognises the
  flag, so the "includes a window reset" hint appears when the window
  flipped without the value going negative.

## [0.41.0] - 2026-05-03
### Fixed
- Δ figures on the sidebar and status bar are no longer computed across
  a window boundary. Previously, when the 5h (or weekly) window reset
  between two consecutive Stop-hook fetches, the bundled hook still
  wrote a blind `curr% - prev%` delta — which compared two different
  windows and surfaced as e.g. `+56% since last fetch` even though only
  pennies were spent in the new window. The parser now detects window
  flips by tracking the `↻` countdown across samples (the countdown can
  only decrease as time passes; an increase implies the window reset),
  nulls out the across-window delta, and marks the sample with
  `fiveWindowReset` / `weekWindowReset`. The sidebar turn card shows
  "window reset / new window" in place of the bogus number, the
  progress-bar Δ line is replaced with "new window — Δ vs previous
  fetch is across windows, hidden", and the status bar shows
  `100% (reset)` instead of `100% (+56%)`. Daily summary's reset
  counter still increments via the new flag (the negative-delta
  heuristic still works for older log lines without the flag).

## [0.40.0] - 2026-05-03
### Added
- The bar (or pair of points) under the cursor is now visually
  highlighted while the tooltip is showing — white-ish stroke on the
  tokens-chart bar segments, fatter stroke + slightly larger radius
  on the limits-chart circles. Each turn's bars/points are wrapped
  in a `<g>` and the hit-area toggles a CSS class on it.

## [0.39.0] - 2026-05-03
### Fixed
- 0.38's per-turn hit-areas were Voronoi cells with no upper-size
  cap — on sparse data they stretched to hours, so hovering far
  from any bar still triggered a tooltip. Each side of the hit zone
  is now capped at 20 px regardless of neighbour distance. Dense
  charts still get full coverage; sparse charts limit hovers to ±20
  px around each bar.

## [0.38.0] - 2026-05-03
### Fixed
- Hovering individual bars/points on the charts is no longer a
  pixel-precision exercise. Both panels now draw an invisible
  full-height "hit area" rect per turn, spanning from the midpoint
  to the previous turn to the midpoint to the next (Voronoi-style),
  with the tooltip handler bound to the rect instead of the bar/
  circle. Bars and circles render as before but with `pointer-events:
  none`. Drag-to-select still works because pointer events bubble
  from the rect to the SVG.

## [0.37.0] - 2026-05-03
### Fixed
- Chart tooltip no longer escapes the visible viewport when hovering
  over points/bars near the right or bottom edge. New
  `positionTooltip(pageX, pageY)` helper measures the tooltip after
  innerHTML is set and flips it to the opposite side of the cursor
  if the default lower-right offset would overflow. Applied in both
  the limits chart and the tokens chart.

## [0.36.0] - 2026-05-03
### Changed
- Settings dropdown moved to the bottom of the sidebar (below the
  mini charts) so it doesn't push the primary stats off-screen.
- Toggling any option no longer collapses the dropdown. Native
  `<details>` resets its open-state on every `webview.html` replace,
  so we replaced it with a manual structure: open-state lives in
  extension memory (`settingsOpen` flag), summary is a `command:`
  link that flips it, options are conditionally rendered.

## [0.35.0] - 2026-05-03
### Added
- **Settings dropdown in the sidebar** (collapsed by default).
  Currently holds two toggles, both sticky in `globalState`:
  - `Show USD spent` (default ON) — hides/shows the per-window and
    per-turn dollar amounts added in 0.34.
  - `VS Code skin support` (default OFF) — moved here from the
    limits chart options. Single source of truth now.
- New commands `claudeUsage.toggleShowUsdSpent` and
  `claudeUsage.toggleVscodeSkin`. Each flips the corresponding
  `ChartSettings` flag, re-renders the sidebar, and pushes fresh
  `ChartData` (with the new `vscodeSkin`) to any open chart panel
  so they re-theme without a panel reload.

### Changed
- Limits chart no longer carries its own `Enable VS Code skin
  support` checkbox. Theme is applied from `ChartData.vscodeSkin`
  on every render — same pattern the tokens panel already used.

## [0.34.0] - 2026-05-03
### Added
- **Window cost in the sidebar.** The 5-Hour Limit and Weekly Limit
  cards now show how much was spent inside the current window in
  USD, just under the percentage. Window start is derived from the
  latest sample's resetsIn countdown (`resetsAt - 5h` / `resetsAt -
  7d`) — sums the cost of every sample inside that range using the
  bundled pricing table. Hidden if pricing is unavailable.
- **Last-turn cost** below the "Last Turn (since previous fetch)"
  card row — `this turn: $X.XX`. Walks back over stale carry-forward
  rows to find the last sample with real token data, so a stale
  refresh doesn't blank the number out.

## [0.33.0] - 2026-05-03
### Added
- **"Enable VS Code skin support" toggle** in the limits chart options
  (next to the gradient colour pickers and Reset button). Off by
  default — chart panels keep the locked dark palette from v0.20. On
  — chart background, borders and text follow the active VS Code
  theme via `--vscode-*` tokens. The setting is single-source on
  ChartSettings; the tokens panel and sidebar mini charts pick it up
  automatically through the existing globalState/postMessage sync.
- White day-boundary dashes and the SVG totals labels in the mini
  tokens chart switched from hard-coded `#ffffff` / `#ddd` / `#999`
  to `currentColor` so they remain visible when the skin override is
  on (light theme: dark dashes on light bg).

## [0.32.0] - 2026-05-03
### Added
- **Drag-to-select on the limits chart** (mirrors the tokens-chart
  selection from 0.31.0). Drag a horizontal range over the chart and
  a yellow-bordered panel below shows the sum of per-turn deltas
  inside the selection — `5h: +Δ%`, `week: +Δ%` — plus turn count and
  duration. Picking 3 turns of `+1%`, `+5%`, `+10%` gives `+16%`.
- If the selection includes a window reset (negative delta), a
  yellow-tinted note flags it so the user knows why the sum dipped.
- Same UX as the tokens chart: click without dragging clears, `Esc`
  clears, changing Day / focus / colours auto-clears.

## [0.31.0] - 2026-05-03
### Added
- **Drag-to-select on the tokens chart.** Click+drag horizontally over
  the bars to highlight a time range; the bars under the rectangle are
  summed and a yellow-bordered panel below the chart shows the totals
  — turn count, time span + duration, total tokens, total cost in USD,
  and a per-segment breakdown (out / in / cache+ / cache-). Useful for
  estimating the cost of "the last 15 turns I spent on feature X".
- Click without dragging clears the selection. `Esc` does the same.
  Selection is dropped automatically when Day, Y axis, or focus is
  changed (the new window's units may not match).

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
