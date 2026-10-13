BEGIN;
ALTER TABLE checklist_donato.delivery_deletion_audits
    ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS restored_by_user_id TEXT,
    ADD COLUMN IF NOT EXISTS restored_by_email TEXT;
COMMIT;
