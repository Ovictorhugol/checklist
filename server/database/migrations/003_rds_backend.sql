-- Completes the original schema for signatures, accessories and reservations.
ALTER TABLE checklist_donato.deliveries ADD COLUMN accessories TEXT NOT NULL DEFAULT '';
ALTER TABLE checklist_donato.deliveries ADD COLUMN signature JSONB CHECK (jsonb_typeof(signature) = 'object');
ALTER TABLE checklist_donato.deliveries ADD COLUMN reservation_id TEXT;
CREATE UNIQUE INDEX deliveries_reservation_id_idx ON checklist_donato.deliveries (reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX deliveries_recipient_email_idx ON checklist_donato.deliveries (recipient_email, created_at DESC);

CREATE TABLE checklist_donato.reservations (
    id TEXT PRIMARY KEY,
    equipment TEXT NOT NULL,
    requester_name TEXT NOT NULL CHECK (length(requester_name) <= 160),
    requester_email TEXT NOT NULL CHECK (requester_email = lower(btrim(requester_email))),
    department TEXT NOT NULL CHECK (length(department) <= 160),
    purpose TEXT NOT NULL CHECK (length(purpose) <= 2000),
    start_date TEXT NOT NULL CHECK (start_date ~ '^\d{4}-\d{2}-\d{2}$'),
    end_date TEXT NOT NULL CHECK (end_date ~ '^\d{4}-\d{2}-\d{2}$' AND end_date >= start_date),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'recusada', 'cancelada')),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT CHECK (length(review_note) <= 1000),
    delivery_id TEXT,
    delivery_protocol TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reservations_requester_email_idx ON checklist_donato.reservations (requester_email, created_at DESC);
CREATE INDEX reservations_status_idx ON checklist_donato.reservations (status, created_at DESC);
CREATE TRIGGER reservations_updated_at BEFORE UPDATE ON checklist_donato.reservations
FOR EACH ROW EXECUTE FUNCTION checklist_donato.set_updated_at();

-- Older audits only contain protocol/asset/recipient; retain those honestly.
ALTER TABLE checklist_donato.delivery_deletion_audits ALTER COLUMN delivery_snapshot DROP NOT NULL;

-- Keep original migration documents and the verification report independently of
-- operational rows, including unknown fields and original timestamp precision.
CREATE TABLE checklist_donato.migration_source_documents (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    document JSONB NOT NULL,
    sha256 TEXT NOT NULL,
    PRIMARY KEY (collection, id)
);
CREATE TABLE checklist_donato.migration_runs (
    id TEXT PRIMARY KEY,
    source_database TEXT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    report JSONB NOT NULL
);
