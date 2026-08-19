-- ===========================================================================
-- 02_revert_bucket.sql -- undo the most recent 01_migrate_bucket.sql run.
--
--   psql "$DATABASE_URL" -f 02_revert_bucket.sql
--
-- Takes no arguments: it reads the newest un-reverted batch out of
-- _bucket_migration_log and restores each row's `data` column from that
-- batch's backup table, matching on the real primary key.
--
-- Rows created AFTER the migration are not in the backup. They are reported
-- and LEFT ALONE -- deleting a live session to undo a path rewrite would be a
-- much worse outcome than a stale path. Decide about those separately.
--
-- Backup tables are kept. Drop them yourself once you are happy:
--   SELECT 'DROP TABLE ' || backup_table || ';' FROM _bucket_migration_log;
-- ===========================================================================

\set ON_ERROR_STOP on

\echo ''
\echo '=== batch to revert ==='
SELECT batch, src_table, backup_table, rows_updated, old_prefix, new_prefix
FROM _bucket_migration_log
WHERE reverted_at IS NULL
  AND batch = (SELECT max(batch) FROM _bucket_migration_log WHERE reverted_at IS NULL)
ORDER BY id;

\echo ''
\echo '=== REVERTING ==='

BEGIN;

DO $$
DECLARE
  r          record;
  b          timestamptz;
  pkcols     text[];
  joincond   text;
  n          bigint;
  orphans    bigint;
  missing    bigint;
BEGIN
  SELECT max(batch) INTO b FROM _bucket_migration_log WHERE reverted_at IS NULL;
  IF b IS NULL THEN
    RAISE NOTICE '  nothing to revert -- no un-reverted batch in _bucket_migration_log';
    RETURN;
  END IF;

  FOR r IN SELECT * FROM _bucket_migration_log
           WHERE reverted_at IS NULL AND batch = b ORDER BY id
  LOOP
    IF to_regclass('public.' || quote_ident(r.backup_table)) IS NULL THEN
      RAISE EXCEPTION 'backup table % is gone -- cannot revert %', r.backup_table, r.src_table;
    END IF;

    -- real primary key of the source table
    SELECT array_agg(a.attname ORDER BY x.ord) INTO pkcols
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS x(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = x.attnum
    WHERE i.indrelid = ('public.' || quote_ident(r.src_table))::regclass
      AND i.indisprimary;

    IF pkcols IS NULL THEN
      RAISE EXCEPTION '% has no primary key -- cannot match backup rows', r.src_table;
    END IF;

    SELECT string_agg(format('t.%I = b.%I', c, c), ' AND ')
    INTO joincond FROM unnest(pkcols) AS c;

    -- restore the jsonb payload only; never touch rows absent from the backup
    EXECUTE format('UPDATE %I t SET data = b.data FROM %I b WHERE %s AND t.data IS DISTINCT FROM b.data',
                   r.src_table, r.backup_table, joincond);
    GET DIAGNOSTICS n = ROW_COUNT;

    EXECUTE format('SELECT count(*) FROM %I t WHERE NOT EXISTS (SELECT 1 FROM %I b WHERE %s)',
                   r.src_table, r.backup_table, joincond) INTO orphans;
    EXECUTE format('SELECT count(*) FROM %I b WHERE NOT EXISTS (SELECT 1 FROM %I t WHERE %s)',
                   r.backup_table, r.src_table, joincond) INTO missing;

    RAISE NOTICE '  % : % row(s) restored  (pk: %)', rpad(r.src_table,30), n, array_to_string(pkcols,',');
    IF orphans > 0 THEN
      RAISE NOTICE '      % row(s) created AFTER the migration -- left as-is', orphans;
    END IF;
    IF missing > 0 THEN
      RAISE WARNING '      % backup row(s) no longer present in % -- deleted since the migration', missing, r.src_table;
    END IF;

    UPDATE _bucket_migration_log SET reverted_at = now() WHERE id = r.id;
  END LOOP;
END $$;

COMMIT;

\echo ''
\echo '=== VERIFY: rows back on the original bucket ==='
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT DISTINCT src_table, old_prefix, new_prefix FROM _bucket_migration_log
           WHERE reverted_at IS NOT NULL
             AND batch = (SELECT max(batch) FROM _bucket_migration_log WHERE reverted_at IS NOT NULL)
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE data::text LIKE %L',
                   r.src_table, '%' || r.old_prefix || '%') INTO n;
    RAISE NOTICE '  % : % row(s) on %', rpad(r.src_table,30), n, r.old_prefix;
    EXECUTE format('SELECT count(*) FROM %I WHERE data::text LIKE %L',
                   r.src_table, '%' || r.new_prefix || '%') INTO n;
    RAISE NOTICE '  % : % row(s) on % (pre-existing rows keep this legitimately)',
                 rpad(r.src_table,30), n, r.new_prefix;
  END LOOP;
END $$;
