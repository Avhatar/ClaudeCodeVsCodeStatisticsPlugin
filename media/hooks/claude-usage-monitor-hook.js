#!/usr/bin/env node
'use strict';

// claude-usage-monitor-hook v=0.45.0
// Stop hook for Claude Code, installed by the "Claude Usage Monitor" VSCode
// extension. On each Stop event:
//   1. Reads transcript_path from stdin and walks the JSONL backwards to
//      sum the session and pluck the last assistant turn's tokens + model.
//   2. Calls the OAuth `usage` endpoint to get 5h/weekly utilization.
//   3. Appends a single human-readable + machine-parseable line to
//      ~/.claude/usage-log.txt.
//
// HOOK_VERSION + the `v=...` comment above are how the extension detects
// whether the installed copy is older than the bundled one and offers an
// update.
//
// Diagnostic side-channel: every invocation appends one line to
// ~/.claude/claude-usage-monitor-hook.invocations.log with status parts
// joined by ` | ` (e.g. `start | stdin=3b | turn in=12 out=843 ... |
// token=present | mode=ok 5h=23.0% wk=28.0% | wrote=151b | dur=312ms`).
// Self-rotates past 100 KB → keeps the last 100 lines. The plugin
// surfaces this file via `Claude Usage: Show hook invocation log`.
// **No silent try/catch** anywhere — every failure has a labelled
// invokeLog() call so post-mortem diagnosis works.

const HOOK_VERSION = '0.45.0';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const TMP_DIR = process.env.TEMP || process.env.TMP || os.tmpdir();
const CACHE_FILE = path.join(TMP_DIR, 'claude-code-usage-limits.json');
const CREDS_FILE = path.join(os.homedir(), '.claude', '.credentials.json');
const LOG_FILE = path.join(os.homedir(), '.claude', 'usage-log.txt');
const INVOCATION_LOG = path.join(os.homedir(), '.claude', 'claude-usage-monitor-hook.invocations.log');
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const FETCH_TIMEOUT_MS = 3000;
const INVOCATION_LOG_MAX_BYTES = 100 * 1024; // 100 KB; keep last ~100 lines on rollover.

// --- Invocation log ---------------------------------------------------------

const invocationStart = Date.now();
const invocationParts = [];
let invocationFlushed = false;

function invokeLog(part) {
    invocationParts.push(part);
}

function flushInvocationLog() {
    if (invocationFlushed) return;
    invocationFlushed = true;
    const dur = Date.now() - invocationStart;
    const line = `[${new Date().toISOString()}] ${invocationParts.join(' | ')} | dur=${dur}ms\n`;
    try {
        const dir = path.dirname(INVOCATION_LOG);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (fs.existsSync(INVOCATION_LOG)) {
            const stat = fs.statSync(INVOCATION_LOG);
            if (stat.size > INVOCATION_LOG_MAX_BYTES) {
                const text = fs.readFileSync(INVOCATION_LOG, 'utf8');
                const lines = text.split(/\r?\n/).filter(Boolean);
                const kept = lines.slice(-100);
                fs.writeFileSync(INVOCATION_LOG, kept.join('\n') + '\n', 'utf8');
            }
        }
        fs.appendFileSync(INVOCATION_LOG, line);
    } catch (err) {
        // The invocation log itself failed to write — last-resort stderr
        // notification. Anything else would be turtles all the way down.
        try { process.stderr.write(`[claude-usage-monitor-hook] failed to write invocation log: ${err.message}\n`); } catch {}
    }
}

process.on('exit', flushInvocationLog);
process.on('uncaughtException', (err) => {
    invokeLog(`uncaught=${err && err.message ? err.message : err}`);
    flushInvocationLog();
    process.exit(0);
});

invokeLog('start');

// --- ANSI for the line that goes to usage-log.txt (stripped before write) ---

const ANSI = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    gray: '\x1b[90m',
};

function colorForPct(pct) {
    if (pct < 70) return ANSI.green;
    if (pct < 90) return ANSI.yellow;
    return ANSI.red;
}

function fmtTokens(n) {
    if (!n || n < 0) return '0';
    if (n < 1000) return String(n);
    if (n < 1_000_000) {
        const v = n / 1000;
        return (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, '') + 'K';
    }
    return (n / 1_000_000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'M';
}

// --- Stdin (transcript_path JSON from Claude Code) -------------------------

function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        let resolved = false;
        const done = () => { if (!resolved) { resolved = true; resolve(data); } };
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (c) => (data += c));
        process.stdin.on('end', done);
        process.stdin.on('error', (err) => {
            invokeLog(`stdin-error=${err.message}`);
            done();
        });
        setTimeout(done, 1500);
    });
}

// --- Transcript parsing -----------------------------------------------------

function parseTranscript(transcriptPath) {
    const empty = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
    const result = { last: { ...empty }, total: { ...empty }, turns: 0, model: null };
    if (!transcriptPath) {
        invokeLog('transcript-missing-path');
        return result;
    }
    if (!fs.existsSync(transcriptPath)) {
        invokeLog(`transcript-not-found=${transcriptPath}`);
        return result;
    }

    let content;
    try {
        content = fs.readFileSync(transcriptPath, 'utf8');
    } catch (err) {
        invokeLog(`transcript-read-error=${err.message}`);
        return result;
    }

    const lines = content.split(/\r?\n/);
    let parseFailures = 0;
    for (const line of lines) {
        if (!line.trim()) continue;
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            // Per-line JSON parse errors are normal in long transcripts (e.g.
            // the writer was mid-flush). We count them but don't bail on a
            // single bad line; the only consequence is a slightly
            // under-counted session total.
            parseFailures += 1;
            continue;
        }
        const u = (entry && entry.message && entry.message.usage) || (entry && entry.usage);
        if (!u || typeof u !== 'object') continue;
        const turn = {
            input: u.input_tokens || 0,
            output: u.output_tokens || 0,
            cacheCreate: u.cache_creation_input_tokens || 0,
            cacheRead: u.cache_read_input_tokens || 0,
        };
        if (turn.input + turn.output + turn.cacheCreate + turn.cacheRead === 0) continue;
        result.total.input += turn.input;
        result.total.output += turn.output;
        result.total.cacheCreate += turn.cacheCreate;
        result.total.cacheRead += turn.cacheRead;
        result.last = turn;
        result.turns += 1;
        const m = entry && entry.message && entry.message.model;
        if (m && typeof m === 'string') {
            // Strip the trailing -YYYYMMDD release date so the key matches
            // pricing.json buckets (e.g. claude-sonnet-4-5-20250929 -> claude-sonnet-4-5).
            result.model = m.replace(/-(\d{8})$/, '');
        }
    }
    if (parseFailures > 0) invokeLog(`transcript-line-parse-failures=${parseFailures}`);
    return result;
}

// --- Credentials ------------------------------------------------------------

function readToken() {
    if (!fs.existsSync(CREDS_FILE)) {
        invokeLog('creds-missing');
        return null;
    }
    let raw;
    try {
        raw = fs.readFileSync(CREDS_FILE, 'utf8');
    } catch (err) {
        invokeLog(`creds-read-error=${err.message}`);
        return null;
    }
    let creds;
    try {
        creds = JSON.parse(raw);
    } catch (err) {
        invokeLog(`creds-parse-error=${err.message}`);
        return null;
    }
    const token = creds && creds.claudeAiOauth && creds.claudeAiOauth.accessToken;
    if (typeof token !== 'string' || token.length === 0) {
        invokeLog('creds-no-token');
        return null;
    }
    return token;
}

// --- Limits cache (delta vs previous run) ----------------------------------

function readPreviousLimits() {
    if (!fs.existsSync(CACHE_FILE)) return null;
    let raw;
    try {
        raw = fs.readFileSync(CACHE_FILE, 'utf8');
    } catch (err) {
        invokeLog(`cache-read-error=${err.message}`);
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (err) {
        invokeLog(`cache-parse-error=${err.message}`);
        return null;
    }
}

function writeLastLimits(data) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
    } catch (err) {
        invokeLog(`cache-write-error=${err.message}`);
    }
}

// --- OAuth usage endpoint --------------------------------------------------

function fetchLimits(token) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (val) => { if (!settled) { settled = true; resolve(val); } };

        const req = https.request(USAGE_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'anthropic-beta': 'oauth-2025-04-20',
                'User-Agent': `claude-usage-monitor-hook/${HOOK_VERSION}`,
                'Accept': 'application/json',
            },
            timeout: FETCH_TIMEOUT_MS,
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (c) => (body += c));
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    invokeLog(`api-http=${res.statusCode}`);
                    return finish({ __error: `HTTP ${res.statusCode}` });
                }
                try {
                    finish(JSON.parse(body));
                } catch (err) {
                    invokeLog(`api-parse-error=${err.message}`);
                    finish({ __error: 'parse' });
                }
            });
        });
        req.on('timeout', () => {
            req.destroy();
            invokeLog('api-timeout');
            finish({ __error: 'timeout' });
        });
        req.on('error', (err) => {
            invokeLog(`api-error=${err.code || err.message}`);
            finish({ __error: err.code || 'net' });
        });
        req.end();
    });
}

// --- OAuth response shape -> percentages ------------------------------------

function pct(value) {
    if (typeof value !== 'number' || !isFinite(value)) return null;
    if (value <= 1) return value * 100;
    return value;
}

function extractPct(node) {
    if (!node || typeof node !== 'object') return null;
    if (typeof node.utilization === 'number') return pct(node.utilization);
    if (typeof node.percent_used === 'number') return pct(node.percent_used);
    if (typeof node.percentage === 'number') return pct(node.percentage);
    if (typeof node.used === 'number' && typeof node.limit === 'number' && node.limit > 0)
        return (node.used / node.limit) * 100;
    if (typeof node.consumed === 'number' && typeof node.total === 'number' && node.total > 0)
        return (node.consumed / node.total) * 100;
    return null;
}

function pickWindow(payload, keys) {
    for (const k of keys) {
        const node = payload[k];
        if (!node || typeof node !== 'object') continue;
        const p = extractPct(node);
        if (p == null) continue;
        return { pct: p, resetsAt: node.resets_at || node.resetsAt || null };
    }
    return null;
}

function pickWindows(payload) {
    if (!payload || typeof payload !== 'object' || payload.__error) return null;
    const five = pickWindow(payload, ['five_hour', 'fiveHour', '5h', 'five_hour_window', 'short_term', 'session', 'window_5h']);
    const week = pickWindow(payload, ['seven_day', 'sevenDay', '7d', 'weekly', 'week', 'long_term', 'window_weekly']);
    return {
        five: five ? five.pct : null,
        week: week ? week.pct : null,
        fiveResetsAt: five ? five.resetsAt : null,
        weekResetsAt: week ? week.resetsAt : null,
    };
}

function fmtUntil(iso) {
    if (!iso) return null;
    const target = new Date(iso).getTime();
    if (!isFinite(target)) return null;
    const ms = target - Date.now();
    if (ms <= 0) return 'now';
    const sec = Math.floor(ms / 1000);
    const days = Math.floor(sec / 86400);
    const hrs = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (days > 0) return `${days}d${hrs}h`;
    if (hrs > 0) return `${hrs}h${mins}m`;
    return `${mins}m`;
}

// --- Log file (the one the extension reads) --------------------------------

function appendLog(line) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    const final = `[${new Date().toISOString()}] ${stripped}\n`;
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
            invokeLog(`log-mkdir-error=${err.message}`);
            try { process.stderr.write(`[claude-usage-monitor-hook] failed to create ${dir}: ${err.message}\n`); } catch {}
            return false;
        }
    }
    try {
        fs.appendFileSync(LOG_FILE, final);
        invokeLog(`wrote=${final.length}b`);
        return true;
    } catch (err) {
        invokeLog(`log-append-error=${err.message}`);
        try { process.stderr.write(`[claude-usage-monitor-hook] failed to append ${LOG_FILE}: ${err.message}\n`); } catch {}
        return false;
    }
}

// --- Main flow -------------------------------------------------------------

async function main() {
    let stdinRaw = '';
    try {
        stdinRaw = await readStdin();
        invokeLog(`stdin=${stdinRaw.length}b`);
    } catch (err) {
        invokeLog(`stdin-thrown=${err.message}`);
    }
    let stdin = {};
    if (stdinRaw) {
        try {
            stdin = JSON.parse(stdinRaw);
        } catch (err) {
            invokeLog(`stdin-parse-error=${err.message}`);
        }
    }
    const transcriptPath = stdin.transcript_path;

    const { last, total, turns, model } = parseTranscript(transcriptPath);
    if (last.input + last.output + last.cacheCreate + last.cacheRead > 0) {
        invokeLog(`turn in=${last.input} out=${last.output} c+=${last.cacheCreate} c-=${last.cacheRead} model=${model || '?'}`);
    } else {
        invokeLog('turn=empty');
    }

    const previous = readPreviousLimits();
    let limits = null;
    let limitsError = null;
    const token = readToken();
    if (!token) {
        limitsError = 'no-token';
    } else {
        invokeLog('token=present');
        const data = await fetchLimits(token);
        if (data && data.__error) {
            limitsError = data.__error;
        } else {
            limits = pickWindows(data);
            if (limits) {
                writeLastLimits(limits);
            } else {
                invokeLog('api-shape-unknown');
                limitsError = 'shape';
            }
        }
    }

    if (limits && (limits.five != null || limits.week != null)) {
        invokeLog(`mode=ok 5h=${limits.five != null ? limits.five.toFixed(1) + '%' : '-'} wk=${limits.week != null ? limits.week.toFixed(1) + '%' : '-'}`);
    } else {
        invokeLog(`mode=limits-fail ${limitsError || ''}`.trim());
    }

    const delta = computeDelta(previous, limits);
    const sessionTotal = total.input + total.output + total.cacheCreate + total.cacheRead;

    const coloredLine = buildLogLine(last, total, sessionTotal, turns, limits, delta, limitsError, model);
    appendLog(coloredLine);
}

function computeDelta(prev, curr) {
    if (!prev || !curr) return null;
    const d = {};
    d.five = (prev.five != null && curr.five != null) ? curr.five - prev.five : null;
    d.week = (prev.week != null && curr.week != null) ? curr.week - prev.week : null;
    if (d.five == null && d.week == null) return null;
    return d;
}

function fmtDelta(d) {
    if (d == null) return '—';
    if (Math.abs(d) < 0.005) return '+0%';
    const rounded = d.toFixed(2);
    if (d > 0) return `+${rounded}%`;
    return `${rounded}%`;
}

function buildLogLine(last, _total, sessionTotal, turns, limits, delta, limitsError, model) {
    const segs = [];
    let turnSeg =
        `${ANSI.dim}|${ANSI.reset} ${ANSI.cyan}turn${ANSI.reset} ` +
        `${ANSI.bold}in:${fmtTokens(last.input)}${ANSI.reset} ` +
        `${ANSI.bold}out:${fmtTokens(last.output)}${ANSI.reset} ` +
        `${ANSI.gray}c+${fmtTokens(last.cacheCreate)} c-${fmtTokens(last.cacheRead)}${ANSI.reset}`;
    if (model) turnSeg += ` ${ANSI.gray}model=${model}${ANSI.reset}`;
    segs.push(turnSeg);
    segs.push(
        `${ANSI.cyan}session${ANSI.reset} ${ANSI.bold}${fmtTokens(sessionTotal)}${ANSI.reset} ` +
        `${ANSI.gray}(${turns} turns)${ANSI.reset}`
    );
    if (limits && (limits.five != null || limits.week != null)) {
        if (limits.five != null) {
            const c = colorForPct(limits.five);
            const d = delta && delta.five != null ? ` ${ANSI.gray}(${fmtDelta(delta.five)})${ANSI.reset}` : '';
            const r = fmtUntil(limits.fiveResetsAt);
            const rs = r ? ` ${ANSI.gray}↻${r}${ANSI.reset}` : '';
            segs.push(`${ANSI.cyan}5h${ANSI.reset} ${c}${limits.five.toFixed(0)}%${ANSI.reset}${d}${rs}`);
        }
        if (limits.week != null) {
            const c = colorForPct(limits.week);
            const d = delta && delta.week != null ? ` ${ANSI.gray}(${fmtDelta(delta.week)})${ANSI.reset}` : '';
            const r = fmtUntil(limits.weekResetsAt);
            const rs = r ? ` ${ANSI.gray}↻${r}${ANSI.reset}` : '';
            segs.push(`${ANSI.cyan}week${ANSI.reset} ${c}${limits.week.toFixed(0)}%${ANSI.reset}${d}${rs}`);
        }
    } else {
        segs.push(`${ANSI.gray}limits: n/a${limitsError ? ` (${limitsError})` : ''}${ANSI.reset}`);
    }
    return segs.join(`  ${ANSI.dim}.${ANSI.reset}  `);
}

main().then(
    () => { flushInvocationLog(); process.exit(0); },
    (err) => {
        invokeLog(`main-rejected=${err && err.message ? err.message : err}`);
        flushInvocationLog();
        process.exit(0);
    }
);
