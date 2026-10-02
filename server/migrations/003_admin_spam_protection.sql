-- Admin-Bereich und Spam-Schutz
--
-- Rollen: "admin" vergibt der Server beim Login (OWNER_TELEGRAM_ID bzw. erster
-- Benutzer bei gesetzter Freigabeliste). Es gibt bewusst keine Oberfläche,
-- um Admin-Rechte zu vergeben.

ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Sperre: Gesperrte können sich anmelden, sehen aber nur ihre Sperrseite
-- (Daten exportieren, Konto löschen, Entsperrung beantragen).
ALTER TABLE users ADD COLUMN blocked_at timestamptz;
ALTER TABLE users ADD COLUMN blocked_reason text
  CHECK (blocked_reason IN ('abuse', 'spam', 'terms', 'automated', 'other'));

CREATE TABLE unblock_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text NOT NULL DEFAULT '',
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX unblock_requests_status_idx ON unblock_requests (status, created_at);
-- Höchstens ein offener Antrag pro Benutzer
CREATE UNIQUE INDEX unblock_requests_open_unique ON unblock_requests (user_id) WHERE status = 'pending';

-- Missbrauchs-Ereignisse. Geschrieben wird nur, wenn ein Limit greift oder ein
-- Admin sperrt/entsperrt – nie bei normaler Nutzung. Keine IP-Adressen.
-- Einträge verfallen nach 90 Tagen und verschwinden mit dem Konto.
CREATE TABLE abuse_events (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  event      text NOT NULL,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX abuse_events_at_idx ON abuse_events (at);
CREATE INDEX abuse_events_event_at_idx ON abuse_events (event, at);
CREATE INDEX abuse_events_user_idx ON abuse_events (user_id);
