-- For an existing PostgreSQL schema. Run with psql -v ON_ERROR_STOP=1 -f this-file.
-- Legacy records stay NULL. New CPF values are checked by the application.
-- CPF is not unique: the same person can receive multiple pieces of equipment.
BEGIN;
ALTER TABLE checklist_donato.deliveries
    ADD COLUMN IF NOT EXISTS recipient_cpf TEXT
    CHECK (recipient_cpf ~ '^[0-9]{11}$');
COMMIT;
