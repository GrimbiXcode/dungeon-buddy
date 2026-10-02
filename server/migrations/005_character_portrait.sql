-- Porträt eines Charakters: ein Anhang des Charakters (Kategorie "portrait").
-- Eigene Spalte statt Feld im Bogen-JSON, damit das Porträt nicht mit dem
-- Autosave des Bogens (Revisionsprüfung) kollidiert. Wird der Anhang
-- gelöscht, verschwindet der Verweis von selbst.
ALTER TABLE characters ADD COLUMN portrait_id uuid REFERENCES attachments(id) ON DELETE SET NULL;
