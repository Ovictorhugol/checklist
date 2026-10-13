BEGIN;
-- Existing duplicate loans must remain intact. Counts retain their occupancy
-- until every active loan is returned or removed. The PK serializes new claims.
LOCK TABLE checklist_donato.deliveries IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS checklist_donato.equipment_possessions (
    identifier_type TEXT NOT NULL CHECK (identifier_type IN ('asset', 'serial')),
    identifier TEXT NOT NULL,
    active_count INTEGER NOT NULL CHECK (active_count >= 0),
    PRIMARY KEY (identifier_type, identifier)
);

INSERT INTO checklist_donato.equipment_possessions (identifier_type, identifier, active_count)
SELECT identifier_type, identifier, count(*)::integer FROM (
    SELECT 'asset' AS identifier_type, lower(btrim(asset_tag)) AS identifier
    FROM checklist_donato.deliveries WHERE status = 'entregue'
    UNION ALL
    SELECT 'serial', lower(btrim(serial_number))
    FROM checklist_donato.deliveries WHERE status = 'entregue'
) active_identifiers GROUP BY identifier_type, identifier
ON CONFLICT (identifier_type, identifier) DO UPDATE SET active_count = EXCLUDED.active_count;

CREATE OR REPLACE FUNCTION checklist_donato.enforce_equipment_possession() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = NEW.status
       AND lower(btrim(OLD.asset_tag)) = lower(btrim(NEW.asset_tag))
       AND lower(btrim(OLD.serial_number)) = lower(btrim(NEW.serial_number)) THEN
        RETURN NEW;
    END IF;

    IF TG_OP <> 'INSERT' AND OLD.status = 'entregue' THEN
        UPDATE checklist_donato.equipment_possessions SET active_count = active_count - 1
        WHERE identifier_type = 'asset' AND identifier = lower(btrim(OLD.asset_tag));
        DELETE FROM checklist_donato.equipment_possessions
        WHERE identifier_type = 'asset' AND identifier = lower(btrim(OLD.asset_tag)) AND active_count = 0;
        UPDATE checklist_donato.equipment_possessions SET active_count = active_count - 1
        WHERE identifier_type = 'serial' AND identifier = lower(btrim(OLD.serial_number));
        DELETE FROM checklist_donato.equipment_possessions
        WHERE identifier_type = 'serial' AND identifier = lower(btrim(OLD.serial_number)) AND active_count = 0;
    END IF;

    IF TG_OP <> 'DELETE' AND NEW.status = 'entregue' THEN
        BEGIN
            INSERT INTO checklist_donato.equipment_possessions VALUES ('asset', lower(btrim(NEW.asset_tag)), 1);
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION USING ERRCODE = '23505', CONSTRAINT = 'deliveries_active_asset_tag_key',
                MESSAGE = 'Patrimônio já está em posse de alguém.';
        END;
        BEGIN
            INSERT INTO checklist_donato.equipment_possessions VALUES ('serial', lower(btrim(NEW.serial_number)), 1);
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION USING ERRCODE = '23505', CONSTRAINT = 'deliveries_active_serial_number_key',
                MESSAGE = 'Número de série já está em posse de alguém.';
        END;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliveries_equipment_possession ON checklist_donato.deliveries;
CREATE TRIGGER deliveries_equipment_possession
AFTER INSERT OR DELETE OR UPDATE OF status, asset_tag, serial_number ON checklist_donato.deliveries
FOR EACH ROW EXECUTE FUNCTION checklist_donato.enforce_equipment_possession();
COMMIT;
