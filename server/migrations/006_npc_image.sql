-- Bild eines NPCs: ein Anhang der Kampagne (Kategorie "portrait").
-- Wird der Anhang gelöscht, verschwindet der Verweis; wird der NPC
-- gelöscht, geht sein Bild mit (Trigger), statt verwaist in der Galerie
-- liegen zu bleiben.
ALTER TABLE npcs ADD COLUMN image_id uuid REFERENCES attachments(id) ON DELETE SET NULL;

CREATE FUNCTION delete_npc_image() RETURNS trigger AS $$
BEGIN
  IF OLD.image_id IS NOT NULL THEN
    DELETE FROM attachments WHERE id = OLD.image_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER npcs_delete_image
  AFTER DELETE ON npcs
  FOR EACH ROW EXECUTE FUNCTION delete_npc_image();
