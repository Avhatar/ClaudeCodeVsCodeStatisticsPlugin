export interface HistoryEntry {
  ts: string;
  five: number;
  week: number;
  fiveDelta: number | null;
  weekDelta: number | null;
  fiveWindowReset?: boolean;
  weekWindowReset?: boolean;
}

export interface DailySummary {
  date: string;
  fiveHourSpent: number;
  fiveHourResets: number;
  weekSpent: number;
  weekResets: number;
  samples: number;
  firstSampleTs: string;
  lastSampleTs: string;
  peakFive: number;
  peakWeek: number;
}

const RESET_THRESHOLD = -1;

export function summarizeByDay(entries: HistoryEntry[]): DailySummary[] {
  const byDay = new Map<string, DailySummary>();
  for (const e of entries) {
    const d = new Date(e.ts);
    if (isNaN(d.getTime())) continue;
    const key = localDateKey(d);
    let s = byDay.get(key);
    if (!s) {
      s = {
        date: key,
        fiveHourSpent: 0,
        fiveHourResets: 0,
        weekSpent: 0,
        weekResets: 0,
        samples: 0,
        firstSampleTs: e.ts,
        lastSampleTs: e.ts,
        peakFive: e.five,
        peakWeek: e.week,
      };
      byDay.set(key, s);
    }
    s.samples += 1;
    s.lastSampleTs = e.ts;
    if (e.five > s.peakFive) s.peakFive = e.five;
    if (e.week > s.peakWeek) s.peakWeek = e.week;
    if (e.fiveWindowReset) {
      // Parser nulled out the across-window delta; count the reset explicitly.
      s.fiveHourResets += 1;
    } else if (e.fiveDelta != null) {
      if (e.fiveDelta > 0) s.fiveHourSpent += e.fiveDelta;
      else if (e.fiveDelta <= RESET_THRESHOLD) s.fiveHourResets += 1;
    }
    if (e.weekWindowReset) {
      s.weekResets += 1;
    } else if (e.weekDelta != null) {
      if (e.weekDelta > 0) s.weekSpent += e.weekDelta;
      else if (e.weekDelta <= RESET_THRESHOLD) s.weekResets += 1;
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function renderDailySummaryMarkdownFromEntries(entries: HistoryEntry[], sourcePath: string): string {
  if (entries.length === 0) {
    return `# Claude Usage — Daily Summary\n\n_No entries parsed from log._\n\nLog file: \`${sourcePath}\`\n`;
  }
  const days = summarizeByDay(entries);
  const total = days.reduce(
    (acc, d) => ({
      five: acc.five + d.fiveHourSpent,
      week: acc.week + d.weekSpent,
      samples: acc.samples + d.samples,
    }),
    { five: 0, week: 0, samples: 0 }
  );

  const rows = days.map(d => {
    const range = `${formatTime(d.firstSampleTs)}–${formatTime(d.lastSampleTs)}`;
    return `| ${d.date} | ${d.fiveHourSpent.toFixed(1)}% | ${d.weekSpent.toFixed(1)}% | ${d.fiveHourResets} | ${d.peakFive.toFixed(0)}% / ${d.peakWeek.toFixed(0)}% | ${d.samples} | ${range} |`;
  });

  return `# Claude Usage — Daily Summary

Source: \`${sourcePath}\`
Days tracked: **${days.length}**, total samples: **${total.samples}**
Lifetime spent: **${total.five.toFixed(1)}%** of 5-hour windows · **${total.week.toFixed(1)}%** of weekly windows

| Date | 5h spent | Week spent | 5h resets | Peak (5h / wk) | Samples | Active range |
|------|---------:|-----------:|----------:|---------------:|--------:|-------------|
${rows.join('\n')}

> **5h spent** = sum of positive deltas during the day. Each 5h window resets ~5h after first use; "5h resets" counts how many resets happened that day.
> **Week spent** = sum of positive weekly deltas.
> **Peak** = highest observed % during the day.
`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
