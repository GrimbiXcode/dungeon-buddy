import { formatDate } from "../../lib/format";
import type { JournalEntry } from "../../lib/types";

export type JournalView = "session" | "day";

export type EntryDraft = {
  sessionNumber: number | null;
  sessionDate: string | null;
  ingameDay: number | null;
  ingameDate: string;
  title: string;
  content: string;
};

export type EntryGroup = {
  key: string;
  title: string;
  subtitle: string;
  entries: JournalEntry[];
};

const byNumber = (a: number | null, b: number | null) =>
  a === b ? 0 : a == null ? -1 : b == null ? 1 : a - b;
const byCreated = (a: JournalEntry, b: JournalEntry) => a.createdAt.localeCompare(b.createdAt);

function unique(values: (string | null | undefined)[]) {
  return [...new Set(values.map(v => (v ?? "").trim()).filter(Boolean))];
}

function dayRange(entries: JournalEntry[]) {
  const days = entries.map(e => e.ingameDay).filter((d): d is number => d != null);
  if (!days.length) return "";
  const min = Math.min(...days);
  const max = Math.max(...days);
  return min === max ? `Tag ${min}` : `Tag ${min}–${max}`;
}

/** Einträge nach Session oder Spieltag gruppieren. Gruppen ohne Zuordnung kommen immer zuletzt. */
export function groupEntries(entries: JournalEntry[], view: JournalView, newestFirst: boolean): EntryGroup[] {
  const map = new Map<number | null, JournalEntry[]>();
  for (const e of entries) {
    const k = view === "session" ? e.sessionNumber : e.ingameDay;
    const list = map.get(k);
    if (list) list.push(e);
    else map.set(k, [e]);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a == null) return 1;
    if (b == null) return -1;
    return newestFirst ? b - a : a - b;
  });
  return keys.map(k => {
    const list = map.get(k)!;
    if (view === "session") {
      list.sort((a, b) => byNumber(a.ingameDay, b.ingameDay) || byCreated(a, b));
      const dates = unique(list.map(e => formatDate(e.sessionDate)));
      return {
        key: `s${k}`,
        title: k == null ? "Ohne Session" : `Session ${k}`,
        subtitle: [dates.join(" / "), dayRange(list)].filter(Boolean).join(" · "),
        entries: list,
      };
    }
    list.sort((a, b) => byNumber(a.sessionNumber, b.sessionNumber) || byCreated(a, b));
    return {
      key: `d${k}`,
      title: k == null ? "Ohne Spieltag" : `Tag ${k}`,
      subtitle: unique(list.map(e => e.ingameDate)).join(" / "),
      entries: list,
    };
  });
}

/**
 * Absicherung: Datum immer als "YYYY-MM-DD" behandeln, auch falls ein
 * Zeitstempel ankommt – sonst verschiebt die lokale Zeitzone das Datum.
 */
export function normalizeEntry(e: JournalEntry): JournalEntry {
  return { ...e, sessionDate: e.sessionDate ? e.sessionDate.slice(0, 10) : null };
}

export function matchesQuery(e: JournalEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${e.title}\n${e.content}\n${e.ingameDate}`.toLowerCase().includes(q);
}

export function maxOf(values: (number | null)[]) {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? Math.max(...nums) : null;
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
