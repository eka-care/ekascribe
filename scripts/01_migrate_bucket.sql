-- ===========================================================================
-- 01_migrate_bucket.sql -- re-point stored blob paths at a new bucket name.
--
--   psql "$DATABASE_URL" -v old=voice-records -v new=cdacchndstvals3arc-b1 \
--        -f 01_migrate_bucket.sql
--
-- Backs up every affected table FIRST (real tables, not temp), then rewrites.
-- Records what it did in _bucket_migration_log so 02_revert_bucket.sql needs
-- no arguments. Safe to abort: everything is in one transaction.
--
-- Copy the objects before running this (the bucket directory level is dropped):
--   aws s3 cp --recursive ./storage/voice-records/ s3://<new>/ \
--     --endpoint-url https://cdacchndstvals3arc.ipstorage.tatacommunications.com
-- ===========================================================================

\set ON_ERROR_STOP on
\timing off

SELECT set_config('my.oldp', 's3://' || :'old' || '/', false) AS old_prefix,
       set_config('my.newp', 's3://' || :'new' || '/', false) AS new_prefix;

CREATE TABLE IF NOT EXISTS _bucket_migration_log (
  id           bigserial PRIMARY KEY,
  batch        timestamptz NOT NULL,
  ran_at       timestamptz NOT NULL DEFAULT now(),
  src_table    text        NOT NULL,
  backup_table text        NOT NULL,
  old_prefix   text        NOT NULL,
  new_prefix   text        NOT NULL,
  rows_updated bigint      NOT NULL,
  reverted_at  timestamptz
);

\echo ''
\echo '=== BEFORE: fields still on the old bucket ==='
DROP TABLE IF EXISTS _blob_audit;
CREATE TEMP TABLE _blob_audit(tbl text, key text, rows bigint, sample text);
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns
           WHERE table_schema='public' AND column_name='data' AND data_type='jsonb'
           ORDER BY table_name
  LOOP
    EXECUTE format(
      'INSERT INTO _blob_audit SELECT %L, key, count(*), left(min(value),90)
         FROM %I, jsonb_each_text(data) WHERE value LIKE %L GROUP BY 1,2',
      t, t, '%' || current_setting('my.oldp') || '%');
  END LOOP;
END $$;
SELECT * FROM _blob_audit ORDER BY tbl, key;

\echo ''
\echo '=== MIGRATING (backup + rewrite, one transaction) ==='

BEGIN;

DO $$
DECLARE
  t text; bkp text; n bigint; b timestamptz := clock_timestamp(); ts text;
  touched int := 0;
BEGIN
  ts := to_char(b, 'YYYYMMDD_HH24MISS');
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.column_name='data' AND c.data_type='jsonb'
      AND c.table_name NOT LIKE '%\_bkp\_%'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE data::text LIKE %L',
                   t, '%' || current_setting('my.oldp') || '%') INTO n;
    CONTINUE WHEN n = 0;

    bkp := left(t, 40) || '_bkp_' || ts;
    -- full row copy; fails loudly rather than clobbering an existing backup
    EXECUTE format('CREATE TABLE %I AS SELECT * FROM %I', bkp, t);

    EXECUTE format(
      'UPDATE %I SET data = replace(data::text, %L, %L)::jsonb WHERE data::text LIKE %L',
      t, current_setting('my.oldp'), current_setting('my.newp'),
      '%' || current_setting('my.oldp') || '%');
    GET DIAGNOSTICS n = ROW_COUNT;

    INSERT INTO _bucket_migration_log
      (batch, src_table, backup_table, old_prefix, new_prefix, rows_updated)
    VALUES (b, t, bkp, current_setting('my.oldp'), current_setting('my.newp'), n);

    RAISE NOTICE '  % -> % : % row(s)', rpad(t,30), rpad(bkp,45), n;
    touched := touched + 1;
  END LOOP;

  IF touched = 0 THEN
    RAISE NOTICE '  nothing to do -- no row contains %', current_setting('my.oldp');
  END IF;
END $$;

COMMIT;

\echo ''
\echo '=== AFTER: must be empty ==='
DO $$
DECLARE t text; n bigint; total bigint := 0;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns
           WHERE table_schema='public' AND column_name='data' AND data_type='jsonb'
             AND table_name NOT LIKE '%\_bkp\_%'
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE data::text LIKE %L',
                   t, '%' || current_setting('my.oldp') || '%') INTO n;
    total := total + n;
  END LOOP;
  IF total = 0 THEN RAISE NOTICE '  OK -- 0 rows left on the old bucket';
  ELSE RAISE EXCEPTION 'MIGRATION INCOMPLETE: % row(s) still on %', total, current_setting('my.oldp');
  END IF;
END $$;

\echo ''
\echo '=== what was backed up (revert reads this) ==='
SELECT batch, src_table, backup_table, rows_updated
FROM _bucket_migration_log WHERE reverted_at IS NULL ORDER BY id;

\echo ''
\echo 'To undo:  psql "$DATABASE_URL" -f 02_revert_bucket.sql'
