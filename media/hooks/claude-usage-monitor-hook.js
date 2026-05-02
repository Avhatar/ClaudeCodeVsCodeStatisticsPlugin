#!/usr/bin/env node
'use strict';

// Stop hook for Claude Code, installed by the "Claude Usage Monitor" VSCode
// extension. Fetches the OAuth usage endpoint and appends a parseable line to
// ~/.claude/usage-log.txt. The extension reads that log to render the panel
// and chart.
//
// Side-channel diagnostic file: ~/.claude/claude-usage-monitor-hook.invocations.log
// One line per hook invocation with status + duration. Self-rotated when too
// large. Lets you see whether Claude Code actually invokes the hook (the most
// common "doesn't work" cause is a stale Claude Code session that never picked
// up the new settings.json).

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const CREDS_FILE = path.join(os.homedir(), '.claude', '.credentials.json');
const LOG_FILE = path.join(os.homedir(), '.claude', 'usage-log.txt');
const INVOCATION_LOG = path.join(os.homedir(), '.claude', 'claude-usage-monitor-hook.invocations.log');
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const FETCH_TIMEOUT_MS = 2000;
const INVOCATION_LOG_MAX_BYTES = 100 * 1024; // 100 KB; keep last ~100 lines on rollover.

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
        process.stderr.write(`[claude-usage-monitor-hook] failed to write invocation log: ${err.message}\n`);
    }
}

process.on('exit', flushInvocationLog);
process.on('uncaughtException', (err) => {
    invokeLog(`uncaught=${err && err.message ? err.message : err}`);
    flushInvocationLog();
    process.exit(0);
});

invokeLog('start');

function readToken() {
    if (!fs.existsSync(CREDS_FILE)) {
        invokeLog('creds-missing');
        return null;
    }
    let creds;
    try {
        creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    } catch (err) {
        invokeLog(`creds-parse-error=${err.message}`);
        return null;
    }
    const token = creds && creds.claudeAiOauth && creds.claudeAiOauth.accessToken;
    if (!token) {
        invokeLog('creds-no-token');
        return null;
    }
    return token;
}

function fetchUsage(token) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
        const req = https.request(USAGE_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'anthropic-beta': 'oauth-2025-04-20',
                'User-Agent': 'claude-usage-monitor-hook/1.0',
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
                    return finish(null);
                }
                try {
                    finish(JSON.parse(body));
                } catch (err) {
                    invokeLog(`api-parse-error=${err.message}`);
                    finish(null);
                }
            });
        });
        req.on('timeout', () => {
            req.destroy();
            invokeLog('api-timeout');
            finish(null);
        });
        req.on('error', (err) => {
            invokeLog(`api-error=${err.code || err.message}`);
            finish(null);
        });
        req.end();
    });
}

function pct(v) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return v <= 1 ? v * 100 : v;
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
    if (!payload || typeof payload !== 'object') return null;
    return {
        five: pickWindow(payload, ['five_hour', 'fiveHour', '5h', 'five_hour_window', 'short_term', 'session', 'window_5h']),
        week: pickWindow(payload, ['seven_day', 'sevenDay', '7d', 'weekly', 'week', 'long_term', 'window_weekly']),
    };
}

function fmtUntil(iso) {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (!isFinite(t)) return null;
    const ms = t - Date.now();
    if (ms <= 0) return 'now';
    const sec = Math.floor(ms / 1000);
    const days = Math.floor(sec / 86400);
    const hrs = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (days > 0) return `${days}d${hrs}h`;
    if (hrs > 0) return `${hrs}h${mins}m`;
    return `${mins}m`;
}

function readStdin() {
    return new Promise((resolve, reject) => {
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
        setTimeout(done, 800);
    });
}

const LAST_LINE_RE = /\[(?<ts>[^\]]+)\][\s\S]*?5h\s+(?<h5>[\d.]+)%(?:\s*↻(?<h5r>\S+))?[\s\S]*?week\s+(?<wk>[\d.]+)%(?:\s*↻(?<wkr>\S+))?/;

function readLastValid() {
    if (!fs.existsSync(LOG_FILE)) return null;
    let raw;
    try {
        raw = fs.readFileSync(LOG_FILE, 'utf8');
    } catch (err) {
        invokeLog(`log-read-error=${err.message}`);
        return null;
    }
    const lines = raw.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
        const m = LAST_LINE_RE.exec(lines[i]);
        if (m && m.groups) {
            return { five: parseFloat(m.groups.h5), week: parseFloat(m.groups.wk) };
        }
    }
    return null;
}

function writeLine(ts, fivePct, weekPct, fiveResetsIn, weekResetsIn, tag) {
    const segs = ['turn (claude-usage-monitor)'];
    if (fivePct != null) {
        segs.push(`5h ${fivePct.toFixed(2)}%${fiveResetsIn ? ' ↻' + fiveResetsIn : ''}`);
    }
    if (weekPct != null) {
        segs.push(`week ${weekPct.toFixed(2)}%${weekResetsIn ? ' ↻' + weekResetsIn : ''}`);
    }
    if (tag) segs.push(tag);
    const line = `[${ts}] | ${segs.join('  .  ')}\n`;

    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
            invokeLog(`log-mkdir-error=${err.message}`);
            process.stderr.write(`[claude-usage-monitor-hook] failed to create ${dir}: ${err.message}\n`);
            return false;
        }
    }
    try {
        fs.appendFileSync(LOG_FILE, line);
        invokeLog(`wrote=${line.length}b`);
        return true;
    } catch (err) {
        invokeLog(`log-append-error=${err.message}`);
        process.stderr.write(`[claude-usage-monitor-hook] failed to append ${LOG_FILE}: ${err.message}\n`);
        return false;
    }
}

(async () => {
    try {
        const stdinData = await readStdin();
        invokeLog(`stdin=${stdinData.length}b`);
    } catch (err) {
        invokeLog(`stdin-thrown=${err.message}`);
    }

    const ts = new Date().toISOString();
    const token = readToken();

    if (!token) {
        const last = readLastValid();
        if (last) {
            invokeLog('mode=stale-no-token');
            writeLine(ts, last.five, last.week, null, null, 'src=stale-no-token');
        } else {
            invokeLog('mode=skip-no-token-no-history');
        }
        return;
    }
    invokeLog('token=present');

    const payload = await fetchUsage(token);
    const windows = pickWindows(payload);

    if (windows && (windows.five || windows.week)) {
        invokeLog(`mode=ok 5h=${windows.five ? windows.five.pct.toFixed(1) + '%' : '-'} wk=${windows.week ? windows.week.pct.toFixed(1) + '%' : '-'}`);
        writeLine(
            ts,
            windows.five ? windows.five.pct : null,
            windows.week ? windows.week.pct : null,
            windows.five ? fmtUntil(windows.five.resetsAt) : null,
            windows.week ? fmtUntil(windows.week.resetsAt) : null,
            null
        );
    } else {
        const last = readLastValid();
        if (last) {
            invokeLog('mode=stale-api-fail');
            writeLine(ts, last.five, last.week, null, null, 'src=stale-api-fail');
        } else {
            invokeLog('mode=skip-api-fail-no-history');
        }
    }
})().then(
    () => { flushInvocationLog(); process.exit(0); },
    (err) => {
        invokeLog(`main-rejected=${err && err.message ? err.message : err}`);
        flushInvocationLog();
        process.exit(0);
    }
);
