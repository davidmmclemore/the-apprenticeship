-- Follow-up to apprenticeship_schema (Supabase advisor finding): name the
-- anonymous-identity exclusion inside each permissive policy as well. The
-- restrictive "No anonymous identities" policy remains as a second layer.
-- Matches the Gathered Pages convention.

do $$
declare
  t text;
  not_anon constant text := 'not coalesce(((select auth.jwt()) ->> ''is_anonymous'')::boolean, false)';
begin
  foreach t in array array[
    'authors', 'author_facts', 'works', 'editions', 'collection_members',
    'apprenticeships', 'season_events', 'season_snapshots', 'apprenticeship_works',
    'route_sections', 'route_steps', 'route_intentions', 'reading_sessions',
    'entries', 'entry_versions', 'themes', 'entry_themes', 'entry_links',
    'question_carries', 'inheritance_entries', 'inheritance_links',
    'retrospectives', 'external_links'
  ]
  loop
    execute format('alter policy "Owners read their rows" on apprenticeship.%I
      using (owner_id = (select auth.uid()) and %s)', t, not_anon);
    execute format('alter policy "Owners add their rows" on apprenticeship.%I
      with check (owner_id = (select auth.uid()) and %s)', t, not_anon);
    execute format('alter policy "Owners change their rows" on apprenticeship.%I
      using (owner_id = (select auth.uid()) and %s)
      with check (owner_id = (select auth.uid()) and %s)', t, not_anon, not_anon);
    execute format('alter policy "Owners remove their rows" on apprenticeship.%I
      using (owner_id = (select auth.uid()) and %s)', t, not_anon);
  end loop;
end;
$$;
