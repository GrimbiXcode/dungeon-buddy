-- Anhänge: Bilder und PDFs zu Kampagnen und Charakteren.
--
-- Die Dateien liegen im Object Storage (S3); hier stehen nur Metadaten und
-- Object-Keys. Die Keys enthalten weder Dateinamen noch Benutzer-ID.
--
-- Ein Anhang gehört genau einer Kampagne oder genau einem Charakter. Wie
-- alle Anwendungsdaten hängt er per ON DELETE CASCADE am Benutzer.

CREATE TABLE attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id   uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id  uuid REFERENCES characters(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('image', 'pdf')),
  category      text NOT NULL DEFAULT 'other' CHECK (category IN
                  ('portrait', 'map', 'notes', 'table', 'scene', 'rules', 'adventure', 'other')),
  title         text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',
  -- Nur zur Anzeige und als Download-Name, nie Teil des Object-Keys
  original_name text NOT NULL DEFAULT '',
  mime_type     text NOT NULL,
  -- Gespeicherte Grösse (nach Verarbeitung), inkl. Vorschaubild
  size_bytes    bigint NOT NULL,
  width         integer,
  height        integer,
  object_key    text NOT NULL UNIQUE,
  thumb_key     text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(campaign_id, character_id) = 1)
);
CREATE INDEX attachments_user_idx ON attachments (user_id);
CREATE INDEX attachments_campaign_idx ON attachments (campaign_id);
CREATE INDEX attachments_character_idx ON attachments (character_id);

-- Objekte, die im Storage noch gelöscht werden müssen. Der Trigger greift
-- auch beim kaskadierten Löschen (Konto, Kampagne, Charakter), sodass die
-- Dateien zuverlässig mit den Daten verschwinden. Ein Hintergrundjob
-- arbeitet die Liste ab.
CREATE TABLE storage_deletions (
  object_key text PRIMARY KEY,
  queued_at  timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION queue_attachment_deletion() RETURNS trigger AS $$
BEGIN
  INSERT INTO storage_deletions (object_key)
  SELECT k FROM unnest(ARRAY[OLD.object_key, OLD.thumb_key]) AS k
  WHERE k IS NOT NULL
  ON CONFLICT DO NOTHING;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attachments_queue_deletion
  AFTER DELETE ON attachments
  FOR EACH ROW EXECUTE FUNCTION queue_attachment_deletion();
