# Claude Usage Monitor

A VS Code extension that surfaces your Claude Code subscription usage — 5-hour and weekly limits, last-turn deltas, and full historical timeline — without ever calling an API itself.

The extension is a passive reader of `~/.claude/usage-log.txt`, which is populated by a small Stop hook that the extension can install for you. All data stays on your machine.

## Features

- **Sidebar view** with live 5-hour limit, weekly limit, and last-turn delta cards.
- **Status bar** indicator: `<icon> NN% (+ΔN%), MM% (+ΔM%)`.
- **Chart panel** with:
  - Free-form day-range input (`1`, `2`, `7`, `(3)`, `1-7`, `3-7`).
  - Gradient lines whose color saturates from "almost empty" to "almost out".
  - Vertical markers for actual and predicted limit resets.
  - Day-boundary verticals when the window spans more than one day.
  - Optional linear forecast to the projected exhaustion point.
  - "Focus on data" zoom that crops empty leading/trailing time.
  - User-configurable colors for both gradients (persisted across reloads).
- **Mini chart** in the sidebar that mirrors the main chart's settings.
- **Daily summary** view (markdown) with per-day spend totals, peaks, and reset counts.
- **Bundled Stop hook** with one-click installation. The extension can deploy and register the hook in `~/.claude/settings.json` for you.

## Screenshots

> Screenshots will be added once layout is finalized. See `media/` for the activity-bar icon.

## Requirements

- **Claude Code** installed and signed in (`/login`). The extension reads `~/.claude/.credentials.json` indirectly through the Stop hook — never directly.
- **Node.js** on `PATH`. The Stop hook is a small Node script invoked by Claude Code on each `Stop` event.
- **VS Code 1.85+**.
- Tested on Windows. The Stop hook is plain Node and should work on macOS / Linux as well, though paths in the documentation use Windows separators.

## Installation

### From a `.vsix`

```bash
code --install-extension claude-usage-monitor-<version>.vsix
```

Then run `Developer: Reload Window` (the command palette is `Ctrl+Shift+P` / `Cmd+Shift+P`). VS Code does not auto-reload extensions on update.

### Setting up the Stop hook

After install, the extension prompts on first activation:

> Claude Usage Monitor: install Stop hook so the plugin can track API usage?

Pick **Install hook**. The extension will:

1. Copy `media/hooks/claude-usage-monitor-hook.js` to `~/.claude/hooks/`.
2. Add an entry under `hooks.Stop[]` in `~/.claude/settings.json`.

Make a single turn in Claude Code; the log file `~/.claude/usage-log.txt` will start populating, and the sidebar will show usage immediately.

If you already have your own Stop hook that writes to the same log file (in the parser-compatible format), the prompt is suppressed to avoid double API calls. You can still run `Claude Usage: Install Stop hook` manually.

## Quick start

1. Install extension and reload window.
2. Click the **Claude Usage** icon in the Activity Bar.
3. If prompted, install the Stop hook.
4. Run a turn in Claude Code.
5. Click the chart icon in the sidebar header (or run `Claude Usage: Show chart`) to open the full chart.

## Settings

| Setting | Default | Description |
|---|---|---|
| `claudeUsage.logPath` | `~/.claude/usage-log.txt` | Override path to the usage log file. Empty = auto-detect. |

Chart options (Day range, gap, gradient colors, forecast, focus, etc.) live inside the chart panel itself and persist via `vscode.setState` — they are scoped to the extension's webview state, not to VS Code settings.

## Commands

All commands are available via `Ctrl+Shift+P` / `Cmd+Shift+P`.

| Command | Description |
|---|---|
| `Claude Usage: Refresh now` | Re-read the log immediately. |
| `Claude Usage: Show chart` | Open the chart in a side panel. |
| `Claude Usage: Show daily summary` | Markdown table of per-day spend. |
| `Claude Usage: Open usage-log.txt` | Open the raw log file. |
| `Claude Usage: Show plugin log` | Open the extension's diagnostic Output channel. |
| `Claude Usage: Install Stop hook` | Deploy and register the bundled hook. |
| `Claude Usage: Remove Stop hook` | Unregister the hook (with optional script delete). |
| `Claude Usage: Show hook status` | Modal showing hook installation status. |

## How it works

```
Claude Code  ── Stop event ──▶  Stop hook (Node script)  ──appendFileSync──▶  ~/.claude/usage-log.txt
                                       │                                              │
                                       ▼                                              ▼
                              GET /api/oauth/usage                            VS Code extension reads it
                              (Anthropic OAuth API)                           (fs.watch + parser)
```

The extension itself **never opens an HTTP connection**. Only the Stop hook reaches out, and it does so once per assistant turn (event-driven, not polled). When the hook fails to reach the API (timeout, 429, network), it falls back to writing the most recent valid percent values with a `src=stale-api-fail` tag, so the timeline doesn't lose the point.

The parser in the extension handles both our hook's lines and the legacy `limits: n/a (HTTP 429)` shape from older third-party hooks; in either case it carries forward the last known good values for stale rows.

## Privacy

- The extension does **not** make any network requests.
- The Stop hook makes a single GET request to `https://api.anthropic.com/api/oauth/usage` per assistant turn, using your own OAuth token from `~/.claude/.credentials.json`. Nothing else is sent. No telemetry.
- All historical data is stored locally in plain text at `~/.claude/usage-log.txt`. The file is append-only and never rotated or deleted by the extension. You can inspect, copy, or delete it at any time.
- The chart's persisted UI state (selected day range, gradient colors, etc.) lives in VS Code's per-extension `webviewState` — also entirely local.

## Troubleshooting

**Sidebar / chart shows "no-log" or "empty-log".**
Either the Stop hook isn't installed, or no turn has fired yet. Run `Claude Usage: Show hook status` to verify, and `Claude Usage: Install Stop hook` if needed. Then make any turn in Claude Code.

**I installed a new version but nothing changed.**
VS Code does not reload installed extensions automatically when you run `code --install-extension`. Run `Developer: Reload Window`. If a chart panel was open, close and reopen it — webviews retain their state across reloads.

**Chart says "Invalid range" for an obvious input like `1`.**
Open and re-open the chart panel after a reload. If the issue persists, the persisted webview state may be corrupted; uninstall and reinstall the extension to reset it.

**The Stop hook doesn't seem to fire on every turn.**
Some turn types (interruptions, certain agent loops) may not trigger a `Stop` event. The extension's parser is resilient to gaps and rate-limit failures, so missing the occasional turn is fine.

**Two Stop hooks are writing to the log.**
If you already had a hook before installing ours, both will run on each `Stop`, doubling API calls. Use `Claude Usage: Remove Stop hook` to drop ours, or remove the older one from `~/.claude/settings.json` manually.

## Architecture / Contributing

See [DEV-NOTES.md](./DEV-NOTES.md) for the full architecture write-up, file map, gotchas (regex backslashes inside template literals!), and version history rationale.

To work on the extension locally:

```bash
git clone <this-repo>
cd claude-usage-monitor
npm install
npm run compile     # one-shot
# or
npm run watch       # continuous

# Press F5 in VS Code to launch an Extension Development Host.
```

Packaging:

```bash
npx @vscode/vsce package --skip-license --allow-missing-repository
code --install-extension claude-usage-monitor-<version>.vsix --force
```

Issues, ideas, and pull requests welcome.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md). The 0.x range was developed iteratively in a single session and is intentionally fine-grained.

## License

See [LICENSE](./LICENSE).
