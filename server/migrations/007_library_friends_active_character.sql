-- Aktiver Charakter pro Kampagne: Sein Bogen öffnet sich direkt über
-- „Charakterbogen“. Gilt nur, solange er der Kampagne aktiv zugewiesen ist;
-- spielt genau ein Charakter mit, ist er es automatisch (siehe API).
ALTER TABLE campaigns ADD COLUMN main_character_id uuid REFERENCES characters(id) ON DELETE SET NULL;

-- Eigene Bibliothek: Kopien von Fähigkeiten, Angriffen, Rüstungen und Zaubern
-- zum Wiederverwenden bei anderen Charakteren.
CREATE TABLE library_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('feature', 'attack', 'armor', 'spell')),
  name        text NOT NULL,
  -- Regelversion, für die der Eintrag erfasst wurde; NULL = beide
  ruleset     text CHECK (ruleset IN ('2014', '2024')),
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Bei Kopien aus der Bibliothek eines Freundes: dessen Anzeigename zum
  -- Zeitpunkt der Kopie (kein Verweis, die Kopie ist eigenständig)
  source_name text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_items_user_idx ON library_items (user_id, kind);

-- Freunde: gegenseitig bestätigte Verbindung. Gefunden wird man nur über den
-- persönlichen Freundescode, es gibt keine Suche über alle Benutzer.
ALTER TABLE users ADD COLUMN friend_code text UNIQUE;
ALTER TABLE users ADD COLUMN library_shared boolean NOT NULL DEFAULT false;

CREATE TABLE friendships (
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX friendships_addressee_idx ON friendships (addressee_id);
-- Pro Paar höchstens eine Verbindung, egal in welche Richtung
CREATE UNIQUE INDEX friendships_pair_unique
  ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
