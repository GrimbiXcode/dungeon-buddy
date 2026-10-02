-- Charaktere gehören dem Benutzer statt einer Kampagne.
--
-- Ein Charakter kann in mehreren Kampagnen gespielt werden; seine Werte
-- (Stufe, TP, Ausrüstung, bekannte Zauber …) gelten überall gleich. Die
-- Zuordnung zu Kampagnen steht in campaign_characters, inklusive Verlauf:
-- Stirbt ein Charakter, wird er in der Kampagne als "ausgeschieden"
-- markiert und durch einen anderen ersetzt.
--
-- Eine Kopie (Fork) ist ein eigenständiger Charakter mit Verweis auf das
-- Original (forked_from); Änderungen wirken nur auf die Kopie.

ALTER TABLE characters ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE characters ADD COLUMN ruleset text NOT NULL DEFAULT '2024' CHECK (ruleset IN ('2014', '2024'));
ALTER TABLE characters ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dead', 'retired'));
ALTER TABLE characters ADD COLUMN forked_from uuid REFERENCES characters(id) ON DELETE SET NULL;

UPDATE characters ch
SET user_id = c.user_id, ruleset = c.ruleset
FROM campaigns c
WHERE c.id = ch.campaign_id;

CREATE TABLE campaign_characters (
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  -- false = ausgeschieden (gestorben, ausgetauscht, abgereist)
  active       boolean NOT NULL DEFAULT true,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  left_at      timestamptz,
  left_reason  text NOT NULL DEFAULT '',
  PRIMARY KEY (campaign_id, character_id)
);
CREATE INDEX campaign_characters_character_idx ON campaign_characters (character_id);

INSERT INTO campaign_characters (campaign_id, character_id, joined_at)
SELECT campaign_id, id, created_at FROM characters;

ALTER TABLE characters ALTER COLUMN user_id SET NOT NULL;
DROP INDEX IF EXISTS characters_campaign_idx;
ALTER TABLE characters DROP COLUMN campaign_id;
CREATE INDEX characters_user_idx ON characters (user_id);

-- Zauber: Gehört ein Zauber einem Charakter, wandert er mit ihm durch alle
-- Kampagnen. Zauber ohne Charakter bleiben Notizen der Kampagne.
ALTER TABLE spells ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
UPDATE spells s SET user_id = c.user_id FROM campaigns c WHERE c.id = s.campaign_id;
ALTER TABLE spells ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE spells ALTER COLUMN campaign_id DROP NOT NULL;
UPDATE spells SET campaign_id = NULL WHERE character_id IS NOT NULL;

ALTER TABLE spells DROP CONSTRAINT spells_character_id_fkey;
ALTER TABLE spells
  ADD CONSTRAINT spells_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
ALTER TABLE spells
  ADD CONSTRAINT spells_owner_check CHECK (campaign_id IS NOT NULL OR character_id IS NOT NULL);
CREATE INDEX spells_character_idx ON spells (character_id);
CREATE INDEX spells_user_idx ON spells (user_id);
