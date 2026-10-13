-- Execute with psql -v ON_ERROR_STOP=1 -f server/sql/001_checklist_schema.sql
-- Initial schema only: aborts if checklist_donato already exists.
-- IDs are supplied by the backend. TEXT preserves existing record identifiers.
-- The PostgreSQL backend must map snake_case columns to the existing API fields.
BEGIN;

CREATE SCHEMA checklist_donato;
REVOKE ALL ON SCHEMA checklist_donato FROM PUBLIC;

CREATE TABLE checklist_donato.users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checklist_donato.deliveries (
    id TEXT PRIMARY KEY,
    protocol TEXT NOT NULL UNIQUE,
    asset_tag TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    recipient TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    recipient_cpf TEXT CHECK (recipient_cpf ~ '^[0-9]{11}$'),
    recipient_department TEXT NOT NULL,
    equipment TEXT NOT NULL,
    model TEXT NOT NULL,
    brand TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'entregue' CHECK (status IN ('entregue', 'devolvido')),
    is_returned BOOLEAN NOT NULL DEFAULT false,
    returned_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_by TEXT,
    parts JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(parts) = 'array'),
    return_inspection JSONB CHECK (jsonb_typeof(return_inspection) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (is_returned = (status = 'devolvido')),
    CHECK (returned_at IS NULL OR returned_at >= delivered_at)
);

CREATE INDEX deliveries_asset_tag_idx ON checklist_donato.deliveries (asset_tag);
CREATE INDEX deliveries_status_created_at_idx ON checklist_donato.deliveries (status, created_at DESC);
CREATE INDEX deliveries_created_at_idx ON checklist_donato.deliveries (created_at DESC);
CREATE INDEX deliveries_returned_at_idx ON checklist_donato.deliveries (returned_at);

CREATE TABLE checklist_donato.protocol_counters (
    year TEXT PRIMARY KEY CHECK (year ~ '^[0-9]{4}$'),
    sequence BIGINT NOT NULL DEFAULT 0 CHECK (sequence >= 0)
);

-- No FK to deliveries: this record must survive deletion of the delivery.
-- No FK to users: preserve the actor's historical identity independently.
CREATE TABLE checklist_donato.delivery_deletion_audits (
    id TEXT PRIMARY KEY,
    delivery_id TEXT NOT NULL,
    delivery_snapshot JSONB NOT NULL CHECK (jsonb_typeof(delivery_snapshot) = 'object'),
    protocol TEXT,
    asset_tag TEXT,
    recipient TEXT,
    deleted_by_user_id TEXT NOT NULL,
    deleted_by_email TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX delivery_deletion_audits_delivery_id_idx ON checklist_donato.delivery_deletion_audits (delivery_id);
CREATE INDEX delivery_deletion_audits_user_id_idx ON checklist_donato.delivery_deletion_audits (deleted_by_user_id);
CREATE INDEX delivery_deletion_audits_deleted_at_idx ON checklist_donato.delivery_deletion_audits (deleted_at DESC);

-- Refresh timestamps on updates without requiring backend assignment.
CREATE FUNCTION checklist_donato.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON checklist_donato.users
FOR EACH ROW EXECUTE FUNCTION checklist_donato.set_updated_at();

CREATE TRIGGER deliveries_updated_at BEFORE UPDATE ON checklist_donato.deliveries
FOR EACH ROW EXECUTE FUNCTION checklist_donato.set_updated_at();

COMMIT;
