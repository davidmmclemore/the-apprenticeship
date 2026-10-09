-- Ownership, isolation and integrity tests for the apprenticeship schema.
--
-- Safe to run against any database where the migration is applied: the whole
-- suite is one DO block that ALWAYS ends by raising an exception, so every
-- change it makes is rolled back. Success is reported as
--   ALL_TESTS_PASSED: <n> checks (rolled back)
-- and failure as
--   TESTS_FAILED: <list>
--
-- It acts as two existing auth users (the two earliest by created_at), using
-- the same request.jwt.claims mechanism PostgREST uses, under the
-- `authenticated` role. It reads only their ids.

create or replace function pg_temp.act_as(p_user uuid, p_anonymous boolean default false)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated',
                      'is_anonymous', p_anonymous)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Returns the SQLSTATE raised by p_sql, or 'ok' if it succeeded.
create or replace function pg_temp.try_sql(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- Returns the number of rows affected by p_sql.
create or replace function pg_temp.rows_affected(p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function pg_temp.act_as(uuid, boolean) to authenticated, anon;
grant execute on function pg_temp.try_sql(text) to authenticated, anon;
grant execute on function pg_temp.rows_affected(text) to authenticated, anon;

do $test$
declare
  ua uuid;
  ub uuid;
  checks integer := 0;
  failures text[] := '{}';
  v text;
  n integer;
  a_author uuid; a_work uuid; a_work2 uuid; a_edition uuid; a_season uuid; a_season2 uuid;
  a_session uuid; a_session_other uuid; a_entry uuid; a_entry2 uuid; a_theme uuid; a_step uuid;
  a_inherit uuid; a_snapshot uuid; snap jsonb;
  b_author uuid; b_work uuid; b_season uuid; b_entry uuid;
  rev integer;

  procedure_note text;
begin
  select id into ua from auth.users order by created_at, id limit 1;
  select id into ub from auth.users where id <> ua order by created_at, id limit 1;
  if ua is null or ub is null then
    raise exception 'TESTS_FAILED: need at least two auth.users rows';
  end if;

  ---------------------------------------------------------------------------
  -- User A builds a season
  ---------------------------------------------------------------------------
  perform pg_temp.act_as(ua);

  insert into apprenticeship.authors (name) values ('Test Author A') returning id into a_author;
  insert into apprenticeship.works (author_id, title, original_year) values (a_author, 'First Work', 1940) returning id into a_work;
  insert into apprenticeship.works (author_id, title) values (a_author, 'Second Work') returning id into a_work2;
  insert into apprenticeship.editions (work_id, publisher, publication_year, isbn, format)
    values (a_work, 'Test House', 2001, '978-0-00-000000-2', 'paperback') returning id into a_edition;
  insert into apprenticeship.apprenticeships (author_id, title, status) values (a_author, 'A Year with A', 'active') returning id into a_season;
  insert into apprenticeship.apprenticeships (author_id, title) values (a_author, 'A Later Season') returning id into a_season2;
  insert into apprenticeship.apprenticeship_works (apprenticeship_id, work_id, scope) values (a_season, a_work, 'essential'), (a_season, a_work2, 'optional'), (a_season2, a_work, 'essential');
  insert into apprenticeship.route_steps (apprenticeship_id, work_id, position, rationale) values (a_season, a_work, 1, 'Begin here') returning id into a_step;
  insert into apprenticeship.reading_sessions (apprenticeship_id, work_id, edition_id, status, is_primary, started_on)
    values (a_season, a_work, a_edition, 'reading', true, current_date) returning id into a_session;
  insert into apprenticeship.reading_sessions (apprenticeship_id, work_id, status)
    values (a_season2, a_work, 'reading') returning id into a_session_other;
  insert into apprenticeship.entries (apprenticeship_id, work_id, session_id, kind, quote_text, quote_locator, body_html)
    values (a_season, a_work, a_session, 'quotation', 'Words of the author.', 'p. 12', '<p>My reading of it.</p>') returning id into a_entry;
  insert into apprenticeship.entries (apprenticeship_id, work_id, kind, body_html, question_status)
    values (a_season, a_work, 'question', '<p>What is joy?</p>', 'open') returning id into a_entry2;
  insert into apprenticeship.themes (apprenticeship_id, name) values (a_season, 'Joy') returning id into a_theme;
  insert into apprenticeship.entry_themes (apprenticeship_id, entry_id, theme_id) values (a_season, a_entry, a_theme);
  insert into apprenticeship.entry_links (from_entry_id, to_entry_id, relation) values (a_entry, a_entry2, 'extends');
  insert into apprenticeship.question_carries (question_entry_id, apprenticeship_id, work_id) values (a_entry2, a_season, a_work2);
  insert into apprenticeship.inheritance_entries (apprenticeship_id, title, category) values (a_season, 'Read slowly', 'reading') returning id into a_inherit;
  insert into apprenticeship.inheritance_links (inheritance_id, entry_id) values (a_inherit, a_entry);
  insert into apprenticeship.retrospectives (apprenticeship_id, why_began_html) values (a_season, '<p>Because.</p>');
  insert into apprenticeship.external_links (work_id, app, label, url) values (a_work, 'personal_library', 'My copy', 'https://example.com/copy');
  checks := checks + 1;

  -- Integrity within one owner -------------------------------------------
  v := pg_temp.try_sql(format(
    'insert into apprenticeship.entries (apprenticeship_id, session_id, kind, body_html) values (%L, %L, ''reflection'', ''x'')',
    a_season, a_session_other));
  checks := checks + 1;
  if v <> '23503' then failures := array_append(failures, ('session from another season accepted: ' || v)::text); end if;

  v := pg_temp.try_sql(format(
    'insert into apprenticeship.route_steps (apprenticeship_id, work_id) values (%L, %L)', a_season2, a_work2));
  checks := checks + 1;
  if v <> '23503' then failures := array_append(failures, ('route step for unselected work accepted: ' || v)::text); end if;

  v := pg_temp.try_sql(format(
    'insert into apprenticeship.entries (apprenticeship_id, kind, quote_text) values (%L, ''quotation'', ''  '')', a_season));
  checks := checks + 1;
  if v <> '23514' then failures := array_append(failures, ('empty quotation accepted: ' || v)::text); end if;

  v := pg_temp.try_sql(format(
    'insert into apprenticeship.entries (apprenticeship_id, kind, body_html) values (%L, ''question'', ''q'')', a_season));
  checks := checks + 1;
  if v <> '23514' then failures := array_append(failures, ('question without status accepted: ' || v)::text); end if;

  v := pg_temp.try_sql(format('delete from apprenticeship.works where id = %L', a_work));
  checks := checks + 1;
  if v <> '23503' then failures := array_append(failures, ('work with reading history deleted: ' || v)::text); end if;

  v := pg_temp.try_sql(format(
    'delete from apprenticeship.apprenticeship_works where apprenticeship_id = %L and work_id = %L', a_season, a_work));
  checks := checks + 1;
  if v <> '23503' then failures := array_append(failures, ('selected work with sessions removed: ' || v)::text); end if;

  v := pg_temp.try_sql(format(
    'insert into apprenticeship.reading_sessions (apprenticeship_id, work_id, status, is_primary) values (%L, %L, ''reading'', true)',
    a_season, a_work2));
  checks := checks + 1;
  if v <> '23505' then failures := array_append(failures, ('second primary session accepted: ' || v)::text); end if;

  -- Duplicate client-generated id (offline sync idempotency relies on this).
  v := pg_temp.try_sql(format(
    'insert into apprenticeship.entries (id, apprenticeship_id, kind, body_html) values (%L, %L, ''reflection'', ''dup'')',
    a_entry, a_season));
  checks := checks + 1;
  if v <> '23505' then failures := array_append(failures, ('duplicate entry id accepted: ' || v)::text); end if;

  -- Reread: a new session; earlier one untouched.
  insert into apprenticeship.reading_sessions (apprenticeship_id, work_id, status, ordinal) values (a_season, a_work, 'reading', 2);
  select count(*) into n from apprenticeship.reading_sessions where apprenticeship_id = a_season and work_id = a_work;
  checks := checks + 1;
  if n <> 2 then failures := array_append(failures, ('reread did not create second session: ' || n)::text); end if;

  -- set_primary_session swaps the primary designation.
  perform apprenticeship.set_primary_session((select id from apprenticeship.reading_sessions where ordinal = 2 and apprenticeship_id = a_season));
  select count(*) into n from apprenticeship.reading_sessions where apprenticeship_id = a_season and is_primary;
  checks := checks + 1;
  if n <> 1 then failures := array_append(failures, ('primary count after swap: ' || n)::text); end if;

  -- Revisions and preserved earlier wording.
  update apprenticeship.entries set body_html = '<p>My revised reading.</p>' where id = a_entry returning revision into rev;
  checks := checks + 1;
  if rev <> 2 then failures := array_append(failures, ('revision not bumped: ' || rev)::text); end if;
  select count(*) into n from apprenticeship.entry_versions where entry_id = a_entry and body_html = '<p>My reading of it.</p>';
  checks := checks + 1;
  if n <> 1 then failures := array_append(failures, ('earlier wording not preserved: ' || n)::text); end if;

  -- Optimistic concurrency: an update against a stale revision matches nothing.
  n := pg_temp.rows_affected(format('update apprenticeship.entries set title = ''stale'' where id = %L and revision = 1', a_entry));
  checks := checks + 1;
  if n <> 0 then failures := array_append(failures, 'stale revision update applied'::text); end if;

  -- History tables are not writable by clients.
  v := pg_temp.try_sql(format(
    'insert into apprenticeship.entry_versions (owner_id, entry_id, revision) values (%L, %L, 99)', ua, a_entry));
  checks := checks + 1;
  if v <> '42501' then failures := array_append(failures, ('client wrote entry_versions: ' || v)::text); end if;
  v := pg_temp.try_sql(format(
    'insert into apprenticeship.season_events (owner_id, apprenticeship_id) values (%L, %L)', ua, a_season));
  checks := checks + 1;
  if v <> '42501' then failures := array_append(failures, ('client wrote season_events: ' || v)::text); end if;

  -- Pause and resume are recorded.
  update apprenticeship.apprenticeships set status = 'paused' where id = a_season;
  update apprenticeship.apprenticeships set status = 'active' where id = a_season;
  select count(*) into n from apprenticeship.season_events where apprenticeship_id = a_season;
  checks := checks + 1;
  if n <> 3 then failures := array_append(failures, ('season events (create, pause, resume) count: ' || n)::text); end if;

  -- Completion snapshot is preserved against later route changes.
  a_snapshot := apprenticeship.complete_apprenticeship(a_season, current_date, 'Done for now');
  update apprenticeship.route_steps set rationale = 'Changed later' where id = a_step;
  select data into snap from apprenticeship.season_snapshots where id = a_snapshot;
  checks := checks + 1;
  if snap #>> '{route,0,rationale}' <> 'Begin here' then failures := array_append(failures, 'snapshot route changed'::text); end if;
  checks := checks + 1;
  if jsonb_array_length(snap -> 'scope') <> 2 then failures := array_append(failures, 'snapshot scope wrong'::text); end if;
  v := pg_temp.try_sql(format('update apprenticeship.season_snapshots set note = ''x'' where id = %L', a_snapshot));
  checks := checks + 1;
  if v <> '42501' then failures := array_append(failures, ('snapshot was updatable: ' || v)::text); end if;
  v := pg_temp.try_sql(format('delete from apprenticeship.season_snapshots where id = %L', a_snapshot));
  checks := checks + 1;
  if v <> '42501' then failures := array_append(failures, ('snapshot was deletable: ' || v)::text); end if;

  -- Search finds the reader's own words.
  select count(*) into n from apprenticeship.search_apprenticeship(a_season, 'revised');
  checks := checks + 1;
  if n < 1 then failures := array_append(failures, 'search did not find entry'::text); end if;

  -- Ownership cannot be reassigned.
  v := pg_temp.try_sql(format('update apprenticeship.works set owner_id = %L where id = %L', ub, a_work));
  checks := checks + 1;
  if v not in ('42501') then failures := array_append(failures, ('owner reassignment: ' || v)::text); end if;

  ---------------------------------------------------------------------------
  -- User B: isolation and cross-user references
  ---------------------------------------------------------------------------
  perform pg_temp.act_as(ub);

  -- B may have real rows of their own in a live project; only count A's ids.
  select count(*) into n from (
    select id from apprenticeship.authors where id = a_author
    union all select id from apprenticeship.works where id in (a_work, a_work2)
    union all select id from apprenticeship.editions where id = a_edition
    union all select id from apprenticeship.apprenticeships where id in (a_season, a_season2)
    union all select id from apprenticeship.reading_sessions where id = a_session
    union all select id from apprenticeship.entries where id in (a_entry, a_entry2)
    union all select id from apprenticeship.themes where id = a_theme
    union all select id from apprenticeship.inheritance_entries where id = a_inherit
    union all select id from apprenticeship.season_snapshots where id = a_snapshot
    union all select entry_id from apprenticeship.entry_versions where entry_id = a_entry
    union all select apprenticeship_id from apprenticeship.retrospectives where apprenticeship_id = a_season
    union all select apprenticeship_id from apprenticeship.season_events where apprenticeship_id = a_season
  ) leaked;
  checks := checks + 1;
  if n <> 0 then failures := array_append(failures, ('B can read A rows: ' || n)::text); end if;

  select count(*) into n from apprenticeship.search_apprenticeship(a_season, 'revised');
  checks := checks + 1;
  if n <> 0 then failures := array_append(failures, 'B search reached A entries'::text); end if;

  n := pg_temp.rows_affected(format('update apprenticeship.entries set title = ''hijack'' where id = %L', a_entry));
  checks := checks + 1;
  if n <> 0 then failures := array_append(failures, 'B updated A entry'::text); end if;
  n := pg_temp.rows_affected(format('delete from apprenticeship.entries where id = %L', a_entry));
  checks := checks + 1;
  if n <> 0 then failures := array_append(failures, 'B deleted A entry'::text); end if;
  n := pg_temp.rows_affected(format('update apprenticeship.apprenticeships set status = ''archived'' where id = %L', a_season));
  checks := checks + 1;
  if n <> 0 then failures := array_append(failures, 'B archived A season'::text); end if;

  -- RPCs respect RLS.
  v := pg_temp.try_sql(format('select apprenticeship.complete_apprenticeship(%L)', a_season2));
  checks := checks + 1;
  if v <> 'P0002' then failures := array_append(failures, ('B completed A season: ' || v)::text); end if;
  v := pg_temp.try_sql(format('select apprenticeship.set_primary_session(%L)', a_session));
  checks := checks + 1;
  if v <> 'P0002' then failures := array_append(failures, ('B set A primary: ' || v)::text); end if;
  perform apprenticeship.reorder_route(a_season, array[a_step]);

  -- Writing rows as someone else.
  v := pg_temp.try_sql(format('insert into apprenticeship.authors (owner_id, name) values (%L, ''Forged'')', ua));
  checks := checks + 1;
  if v <> '42501' then failures := array_append(failures, ('B inserted row owned by A: ' || v)::text); end if;

  -- B's own season works.
  insert into apprenticeship.authors (name) values ('Test Author B') returning id into b_author;
  insert into apprenticeship.works (author_id, title) values (b_author, 'B Work') returning id into b_work;
  insert into apprenticeship.apprenticeships (author_id, title) values (b_author, 'B Season') returning id into b_season;
  insert into apprenticeship.apprenticeship_works (apprenticeship_id, work_id) values (b_season, b_work);
  insert into apprenticeship.entries (apprenticeship_id, kind, body_html) values (b_season, 'reflection', '<p>B</p>') returning id into b_entry;
  checks := checks + 1;

  -- Cross-user references, each must be rejected.
  foreach procedure_note in array array[
    format('insert into apprenticeship.works (author_id, title) values (%L, ''x'')', a_author),
    format('insert into apprenticeship.apprenticeships (author_id, title) values (%L, ''x'')', a_author),
    format('insert into apprenticeship.editions (work_id) values (%L)', a_work),
    format('insert into apprenticeship.apprenticeship_works (apprenticeship_id, work_id) values (%L, %L)', b_season, a_work),
    format('insert into apprenticeship.apprenticeship_works (apprenticeship_id, work_id) values (%L, %L)', a_season, b_work),
    format('insert into apprenticeship.entries (apprenticeship_id, kind, body_html) values (%L, ''reflection'', ''x'')', a_season),
    format('insert into apprenticeship.entries (apprenticeship_id, work_id, kind, body_html) values (%L, %L, ''reflection'', ''x'')', b_season, a_work),
    format('insert into apprenticeship.entries (apprenticeship_id, session_id, kind, body_html) values (%L, %L, ''reflection'', ''x'')', b_season, a_session),
    format('insert into apprenticeship.entry_links (from_entry_id, to_entry_id) values (%L, %L)', b_entry, a_entry),
    format('insert into apprenticeship.entry_themes (apprenticeship_id, entry_id, theme_id) values (%L, %L, %L)', b_season, b_entry, a_theme),
    format('insert into apprenticeship.question_carries (question_entry_id, apprenticeship_id) values (%L, %L)', a_entry2, b_season),
    format('insert into apprenticeship.inheritance_links (inheritance_id, entry_id) values (%L, %L)', a_inherit, b_entry),
    format('insert into apprenticeship.collection_members (collection_work_id, member_work_id) values (%L, %L)', b_work, a_work),
    format('insert into apprenticeship.external_links (work_id, label, url) values (%L, ''x'', ''https://example.com'')', a_work),
    format('insert into apprenticeship.retrospectives (apprenticeship_id) values (%L)', a_season2),
    format('insert into apprenticeship.reading_sessions (apprenticeship_id, work_id) values (%L, %L)', a_season, a_work),
    format('update apprenticeship.works set author_id = %L where id = %L', a_author, b_work),
    format('update apprenticeship.entries set apprenticeship_id = %L where id = %L', a_season, b_entry)
  ]
  loop
    v := pg_temp.try_sql(procedure_note);
    checks := checks + 1;
    if v = 'ok' then failures := array_append(failures, ('cross-user reference accepted: ' || procedure_note)::text); end if;
  end loop;

  ---------------------------------------------------------------------------
  -- Anonymous identities and the anon role
  ---------------------------------------------------------------------------
  perform pg_temp.act_as(ub, true);
  select count(*) into n from apprenticeship.works where id = b_work;
  checks := checks + 1;
  if n <> 0 then failures := array_append(failures, 'anonymous identity read rows'::text); end if;
  v := pg_temp.try_sql(format('insert into apprenticeship.authors (name) values (''anon'')'));
  checks := checks + 1;
  if v <> '42501' then failures := array_append(failures, ('anonymous identity inserted: ' || v)::text); end if;

  perform set_config('role', 'anon', true);
  v := pg_temp.try_sql('select count(*) from apprenticeship.works');
  checks := checks + 1;
  if v <> '42501' then failures := array_append(failures, ('anon role reached tables: ' || v)::text); end if;
  v := pg_temp.try_sql(format('select apprenticeship.search_apprenticeship(%L, ''x'')', b_season));
  checks := checks + 1;
  if v <> '42501' then failures := array_append(failures, ('anon role executed function: ' || v)::text); end if;

  if array_length(failures, 1) is not null then
    raise exception 'TESTS_FAILED: %', array_to_string(failures, ' | ');
  end if;
  raise exception 'ALL_TESTS_PASSED: % checks (rolled back)', checks;
end;
$test$;
