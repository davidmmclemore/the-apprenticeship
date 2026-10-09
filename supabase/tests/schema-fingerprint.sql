-- Fingerprint of the apprenticeship schema, used to confirm that a deployed
-- project matches the locally tested migration.
select kind, md5(string_agg(def, E'\n' order by def)) as hash, count(*) as n from (
  select 'columns' as kind, format('%s.%s %s %s %s', c.table_name, c.column_name, c.data_type, c.is_nullable, coalesce(c.column_default, c.generation_expression, '')) as def
    from information_schema.columns c where c.table_schema = 'apprenticeship'
  union all
  select 'constraints', conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'apprenticeship'::regnamespace
  union all
  select 'indexes', indexdef from pg_indexes where schemaname = 'apprenticeship'
  union all
  select 'policies', format('%s %s %s %s %s %s %s', tablename, policyname, permissive, roles, cmd, qual, with_check)
    from pg_policies where schemaname = 'apprenticeship'
  union all
  select 'functions', pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'apprenticeship'::regnamespace
  union all
  select 'triggers', pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'apprenticeship'::regnamespace and not t.tgisinternal
  union all
  select 'table_grants', format('%s %s %s', table_name, grantee, privilege_type)
    from information_schema.role_table_grants
   where table_schema = 'apprenticeship' and grantee in ('anon', 'authenticated', 'public')
  union all
  select 'rls', relname || ' ' || relrowsecurity from pg_class where relnamespace = 'apprenticeship'::regnamespace and relkind = 'r'
) d group by kind order by kind;
