BEGIN;
ALTER TABLE checklist_donato.delivery_email_jobs ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'delivery' CHECK (event_type IN ('delivery', 'return'));
ALTER TABLE checklist_donato.delivery_email_jobs DROP CONSTRAINT IF EXISTS delivery_email_jobs_delivery_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_email_event_idx ON checklist_donato.delivery_email_jobs (delivery_id, event_type);

CREATE OR REPLACE FUNCTION checklist_donato.queue_signed_delivery_email() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.signature IS NOT NULL AND NEW.recipient_email <> ''
           AND NOT EXISTS (SELECT 1 FROM checklist_donato.delivery_deletion_audits WHERE delivery_id = NEW.id) THEN
            INSERT INTO checklist_donato.delivery_email_jobs (id, delivery_id, event_type, recipient_email, snapshot)
            VALUES (NEW.id, NEW.id, 'delivery', NEW.recipient_email, to_jsonb(NEW))
            ON CONFLICT (delivery_id, event_type) DO NOTHING;
        END IF;
    ELSIF NEW.is_returned AND NOT COALESCE(OLD.is_returned, false)
          AND NEW.return_inspection->'signature' IS NOT NULL
          AND NEW.return_inspection->'signature' <> 'null'::jsonb AND NEW.recipient_email <> '' THEN
        INSERT INTO checklist_donato.delivery_email_jobs (id, delivery_id, event_type, recipient_email, snapshot)
        VALUES (NEW.id || ':return', NEW.id, 'return', NEW.recipient_email, to_jsonb(NEW))
        ON CONFLICT (delivery_id, event_type) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS deliveries_queue_signed_email ON checklist_donato.deliveries;
CREATE TRIGGER deliveries_queue_signed_email AFTER INSERT OR UPDATE ON checklist_donato.deliveries
FOR EACH ROW EXECUTE FUNCTION checklist_donato.queue_signed_delivery_email();
COMMIT;
