import { sql } from "../db.js";
import { env } from "../env.js";
import { sendMessage } from "../auth/bot.js";

/** Schwellen für den Alarm an die Admins (ausgelöst bei >=). */
export const ABUSE_ALERT_THRESHOLDS = {
  rateLimited: { window: "1 hour", threshold: 100, label: "Rate-Limit-Treffer (1 h)" },
  quotaExceeded: { window: "24 hours", threshold: 50, label: "Obergrenzen erreicht (24 h)" },
  registrationLimited: { window: "24 hours", threshold: 10, label: "Abgewiesene Registrierungen (24 h)" },
  pendingUnblockRequests: { window: null, threshold: 5, label: "Offene Entsperr-Anträge" },
} as const;
type Metric = keyof typeof ABUSE_ALERT_THRESHOLDS;

const EVENT_OF: Record<Exclude<Metric, "pendingUnblockRequests">, string> = {
  rateLimited: "limit.rate_limited",
  quotaExceeded: "limit.quota_exceeded",
  registrationLimited: "registration.limited",
};

export async function abuseCounts(): Promise<Record<Metric, number>> {
  const counts = {} as Record<Metric, number>;
  for (const [metric, event] of Object.entries(EVENT_OF) as [Metric, string][]) {
    const window = ABUSE_ALERT_THRESHOLDS[metric].window!;
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM abuse_events WHERE event = ${event} AND at > now() - ${window}::interval
    `;
    counts[metric] = row!.n;
  }
  const [pending] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM unblock_requests WHERE status = 'pending'`;
  counts.pendingUnblockRequests = pending!.n;
  return counts;
}

/** Übersicht für die Admin-Seite "Missbrauch". */
export async function getAbuseOverview() {
  const counts = await abuseCounts();
  const metrics = (Object.keys(ABUSE_ALERT_THRESHOLDS) as Metric[]).map(key => ({
    key,
    label: ABUSE_ALERT_THRESHOLDS[key].label,
    value: counts[key],
    threshold: ABUSE_ALERT_THRESHOLDS[key].threshold,
    exceeded: counts[key] >= ABUSE_ALERT_THRESHOLDS[key].threshold,
  }));
  const rateLimitedByBucket = await sql`
    SELECT detail->>'bucket' AS bucket, count(*)::int AS n FROM abuse_events
    WHERE event = 'limit.rate_limited' AND at > now() - interval '24 hours'
    GROUP BY 1 ORDER BY 2 DESC
  `;
  const quotaByName = await sql`
    SELECT detail->>'quota' AS quota, count(*)::int AS n FROM abuse_events
    WHERE event = 'limit.quota_exceeded' AND at > now() - interval '24 hours'
    GROUP BY 1 ORDER BY 2 DESC
  `;
  const newUsersPerDay = await sql`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS n FROM users
    WHERE created_at > now() - interval '14 days'
    GROUP BY 1 ORDER BY 1 DESC
  `;
  const topUsers = await sql`
    SELECT u.id, u.display_name, u.blocked_at, count(*)::int AS n FROM abuse_events e
    JOIN users u ON u.id = e.user_id
    WHERE e.at > now() - interval '7 days' AND e.event IN ('limit.rate_limited', 'limit.quota_exceeded')
    GROUP BY u.id ORDER BY n DESC LIMIT 10
  `;
  const [blocked] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM users WHERE blocked_at IS NOT NULL`;
  return { metrics, rateLimitedByBucket, quotaByName, newUsersPerDay, topUsers, blockedUsers: blocked!.n };
}

/** Pro Schwelle höchstens ein Alarm alle 6 Stunden. */
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const lastAlert = new Map<Metric, number>();

/** Prüft die Schwellen und benachrichtigt alle Admins per Telegram. */
export async function runAbuseCheck(now = Date.now()) {
  const counts = await abuseCounts();
  const hits = (Object.keys(ABUSE_ALERT_THRESHOLDS) as Metric[]).filter(
    m => counts[m] >= ABUSE_ALERT_THRESHOLDS[m].threshold && now - (lastAlert.get(m) ?? 0) >= COOLDOWN_MS
  );
  if (!hits.length) return [];
  for (const m of hits) lastAlert.set(m, now);
  const lines = hits.map(m => `• ${ABUSE_ALERT_THRESHOLDS[m].label}: ${counts[m]} (Schwelle ${ABUSE_ALERT_THRESHOLDS[m].threshold})`);
  const text =
    `⚠️ ${env.appName}: Auffälligkeiten beim Missbrauchsschutz\n\n${lines.join("\n")}` +
    (env.appBaseUrl ? `\n\n${env.appBaseUrl}/verwaltung/missbrauch` : "");
  const admins = await sql<{ telegramId: string }[]>`SELECT telegram_id FROM users WHERE role = 'admin' AND blocked_at IS NULL`;
  for (const a of admins) await sendMessage(a.telegramId, text);
  return hits;
}

export function resetAbuseAlerts() {
  lastAlert.clear();
}
