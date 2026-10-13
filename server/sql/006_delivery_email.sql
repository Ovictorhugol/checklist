BEGIN;
CREATE TABLE IF NOT EXISTS checklist_donato.delivery_email_jobs (
    id TEXT PRIMARY KEY,
    delivery_id TEXT NOT NULL UNIQUE,
    recipient_email TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    pdf BYTEA,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'accepted', 'failed', 'review')),
    attempts INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_email_pending_idx ON checklist_donato.delivery_email_jobs (next_attempt_at) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS checklist_donato.delivery_email_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES checklist_donato.delivery_email_jobs(id),
    attempt_no INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    result TEXT NOT NULL DEFAULT 'processing',
    error TEXT
);
CREATE OR REPLACE FUNCTION checklist_donato.queue_signed_delivery_email() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF NEW.signature IS NOT NULL AND NEW.recipient_email <> ''
       AND NOT EXISTS (SELECT 1 FROM checklist_donato.delivery_deletion_audits WHERE delivery_id = NEW.id) THEN
        INSERT INTO checklist_donato.delivery_email_jobs (id, delivery_id, recipient_email, snapshot)
        VALUES (NEW.id, NEW.id, NEW.recipient_email, to_jsonb(NEW))
        ON CONFLICT (delivery_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS deliveries_queue_signed_email ON checklist_donato.deliveries;
CREATE TRIGGER deliveries_queue_signed_email AFTER INSERT ON checklist_donato.deliveries
FOR EACH ROW EXECUTE FUNCTION checklist_donato.queue_signed_delivery_email();
COMMIT;
