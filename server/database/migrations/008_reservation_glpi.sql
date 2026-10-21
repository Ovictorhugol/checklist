BEGIN;
ALTER TABLE checklist_donato.reservations ADD COLUMN IF NOT EXISTS glpi_ticket_id INTEGER;
ALTER TABLE checklist_donato.reservations ADD COLUMN IF NOT EXISTS glpi_ticket_url TEXT;
ALTER TABLE checklist_donato.reservations ADD COLUMN IF NOT EXISTS glpi_status TEXT CHECK (glpi_status IN ('pending', 'processing', 'created', 'failed', 'review'));
ALTER TABLE checklist_donato.reservations ADD COLUMN IF NOT EXISTS glpi_error TEXT;
-- Set the default after adding the column: existing reservations remain unqueued.
ALTER TABLE checklist_donato.reservations ALTER COLUMN glpi_status SET DEFAULT 'pending';
CREATE TABLE IF NOT EXISTS checklist_donato.reservation_glpi_jobs (
    reservation_id TEXT PRIMARY KEY REFERENCES checklist_donato.reservations(id),
    snapshot JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'created', 'failed', 'review')),
    ticket_id INTEGER,
    ticket_url TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservation_glpi_pending_idx ON checklist_donato.reservation_glpi_jobs (next_attempt_at) WHERE status = 'pending';
CREATE OR REPLACE FUNCTION checklist_donato.queue_reservation_glpi() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    INSERT INTO checklist_donato.reservation_glpi_jobs (reservation_id, snapshot) VALUES (NEW.id, to_jsonb(NEW))
    ON CONFLICT (reservation_id) DO NOTHING;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reservations_queue_glpi ON checklist_donato.reservations;
CREATE TRIGGER reservations_queue_glpi AFTER INSERT ON checklist_donato.reservations
FOR EACH ROW EXECUTE FUNCTION checklist_donato.queue_reservation_glpi();
CREATE OR REPLACE FUNCTION checklist_donato.sync_reservation_glpi() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    UPDATE checklist_donato.reservations SET glpi_status = NEW.status, glpi_ticket_id = NEW.ticket_id,
      glpi_ticket_url = NEW.ticket_url, glpi_error = NEW.last_error WHERE id = NEW.reservation_id;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reservation_glpi_status ON checklist_donato.reservation_glpi_jobs;
CREATE TRIGGER reservation_glpi_status AFTER UPDATE ON checklist_donato.reservation_glpi_jobs
FOR EACH ROW EXECUTE FUNCTION checklist_donato.sync_reservation_glpi();
COMMIT;
