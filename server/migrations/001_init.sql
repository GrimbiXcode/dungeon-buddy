-- Dungeon Buddy – Grundschema
--
-- Datenschutz-Grundsatz: Ausser den Anwendungsdaten wird nichts gespeichert.
-- Keine IP-Adressen, keine Logins-Protokolle, keine Telegram-Profilbilder.
-- Alles hängt per ON DELETE CASCADE am Benutzer: Löscht er sein Konto,
-- verschwindet jede Zeile, die zu ihm gehört.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Einziges Merkmal aus Telegram, das wir dauerhaft brauchen: die numerische
  -- ID, um den Benutzer beim nächsten Login wiederzuerkennen.
  telegram_id   bigint NOT NULL UNIQUE,
  display_name  text NOT NULL,
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Wird erhöht, um alle Sitzungen zu widerrufen ("Überall abmelden").
  token_version integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Kurzlebige Login-Codes aus dem Telegram-Bot. Werden beim Einlösen,
-- nach Ablauf (5 Minuten) und beim Löschen des Kontos entfernt.
CREATE TABLE login_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL,
  telegram_id  bigint NOT NULL,
  -- Nur zum Vorbelegen des Anzeigenamens bei der ersten Anmeldung.
  display_name text,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_codes_code_idx ON login_codes (code);
CREATE INDEX login_codes_expires_idx ON login_codes (expires_at);

CREATE TABLE campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  theme       text NOT NULL DEFAULT 'arcane',
  -- '2014' (5e / SRD 5.1) oder '2024' (5e 2024 / SRD 5.2)
  ruleset     text NOT NULL DEFAULT '2024' CHECK (ruleset IN ('2014', '2024')),
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_user_idx ON campaigns (user_id);

-- Tagebuch: Einträge pro Session und Tag im Spiel
CREATE TABLE journal_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_number integer,
  session_date   date,
  ingame_day     integer,
  ingame_date    text NOT NULL DEFAULT '',
  title          text NOT NULL DEFAULT '',
  content        text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_campaign_idx ON journal_entries (campaign_id);

-- Soziales Netzwerk: NPCs und ihre Beziehungen
CREATE TABLE npcs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        text NOT NULL,
  role        text NOT NULL DEFAULT '',
  faction     text NOT NULL DEFAULT '',
  location    text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'alive' CHECK (status IN ('alive', 'dead', 'missing', 'unknown')),
  -- Haltung gegenüber der Gruppe / dem eigenen Charakter: -2 (feindlich) bis +2 (verbündet)
  attitude    smallint NOT NULL DEFAULT 0 CHECK (attitude BETWEEN -2 AND 2),
  relation    text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '',
  tags        text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX npcs_campaign_idx ON npcs (campaign_id);

CREATE TABLE npc_relations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  from_npc_id uuid NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  to_npc_id   uuid NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  label       text NOT NULL DEFAULT '',
  attitude    smallint NOT NULL DEFAULT 0 CHECK (attitude BETWEEN -2 AND 2),
  notes       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (from_npc_id <> to_npc_id)
);
CREATE INDEX npc_relations_campaign_idx ON npc_relations (campaign_id);

-- Charakterbögen: die Bogendaten liegen als JSON vor, damit der Bogen
-- wachsen kann, ohne für jedes Feld eine Migration zu brauchen.
CREATE TABLE characters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision    integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX characters_campaign_idx ON characters (campaign_id);

-- Zauberbuch: Zauber werden beim Hinzufügen aus dem SRD kopiert und sind
-- danach frei bearbeitbar. Optional einem Charakter zugeordnet.
CREATE TABLE spells (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id    uuid REFERENCES characters(id) ON DELETE SET NULL,
  srd_key         text,
  name            text NOT NULL,
  level           smallint NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 9),
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  prepared        boolean NOT NULL DEFAULT false,
  always_prepared boolean NOT NULL DEFAULT false,
  favorite        boolean NOT NULL DEFAULT false,
  notes           text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX spells_campaign_idx ON spells (campaign_id);
