-- The Apprenticeship: author seasons, routes, reading sessions, notebook,
-- themes, inheritance and retrospectives.
--
-- Everything lives in the dedicated `apprenticeship` schema. Nothing outside
-- this schema is created, altered or granted here.
--
-- Ownership model
--   * Every table carries owner_id (defaulting to auth.uid()).
--   * RLS restricts every operation to the owner; anonymous identities are
--     excluded by a restrictive policy.
--   * Every parent reference is a composite foreign key that includes
--     owner_id, so a row can never point at another user's record, even by a
--     guessed id. Ownership cannot be reassigned (trigger guard).
--   * anon receives no privileges at all.
--
-- After applying, add `apprenticeship` to Exposed schemas in the Supabase
-- dashboard (Project Settings -> Data API). See README.

create schema if not exists apprenticeship;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type apprenticeship.season_status as enum
  ('planned', 'active', 'paused', 'completed', 'archived');

create type apprenticeship.work_type as enum
  ('book', 'essay', 'letter', 'poem', 'collection', 'short_story', 'sermon',
   'lecture', 'play', 'article', 'other');

create type apprenticeship.edition_format as enum
  ('hardcover', 'paperback', 'print', 'ebook', 'audiobook', 'online', 'other');

create type apprenticeship.scope_level as enum
  ('essential', 'optional', 'outside');

create type apprenticeship.route_origin as enum
  ('mine', 'publication_order', 'imported');

create type apprenticeship.session_status as enum
  ('not_started', 'reading', 'paused', 'finished', 'set_aside');

create type apprenticeship.position_kind as enum
  ('page', 'chapter', 'section', 'ebook_location', 'audiobook_timestamp',
   'free_text');

create type apprenticeship.entry_kind as enum
  ('quotation', 'reflection', 'question', 'observation');

create type apprenticeship.provenance as enum
  ('mine', 'imported', 'ai_suggested');

create type apprenticeship.question_status as enum
  ('open', 'developing', 'resolved');

create type apprenticeship.link_relation as enum
  ('extends', 'complicates', 'contradicts', 'related', 'unsure');

create type apprenticeship.inheritance_category as enum
  ('life', 'ministry', 'reading', 'writing', 'other');

create type apprenticeship.fact_kind as enum ('biography', 'event');

create type apprenticeship.verification as enum
  ('unverified', 'verified', 'uncertain');

create type apprenticeship.external_app as enum
  ('personal_library', 'the_study', 'other');

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

create function apprenticeship.tg_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Ownership cannot be reassigned' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Revisioned tables: bump revision on every update so clients can detect
-- concurrent edits (optimistic concurrency) instead of silently overwriting.
create function apprenticeship.tg_touch_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Ownership cannot be reassigned' using errcode = '42501';
  end if;
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authors and author portrait
-- ---------------------------------------------------------------------------

create table apprenticeship.authors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 300),
  sort_name text check (sort_name is null or length(sort_name) <= 300),
  portrait_url text check (portrait_url is null or portrait_url ~* '^https?://'),
  life_dates text check (life_dates is null or length(life_dates) <= 120),
  intro_notes_html text check (intro_notes_html is null or length(intro_notes_html) <= 200000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index authors_owner_idx on apprenticeship.authors (owner_id);

-- Sourced biographical notes and events. Kept apart from intro_notes_html
-- (the reader's own interpretation).
create table apprenticeship.author_facts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_id uuid not null,
  kind apprenticeship.fact_kind not null default 'event',
  year integer check (year is null or year between -3000 and 3000),
  date_text text check (date_text is null or length(date_text) <= 120),
  body text not null check (length(btrim(body)) between 1 and 20000),
  source_citation text check (source_citation is null or length(source_citation) <= 2000),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  verification apprenticeship.verification not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (author_id, owner_id) references apprenticeship.authors (id, owner_id) on delete cascade
);
create index author_facts_owner_idx on apprenticeship.author_facts (owner_id);
create index author_facts_author_idx on apprenticeship.author_facts (author_id, year);

-- ---------------------------------------------------------------------------
-- Works, editions, collections
-- ---------------------------------------------------------------------------

-- An original intellectual work. Original publication year is stored apart
-- from any edition's publication year and may be unknown.
create table apprenticeship.works (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 500),
  work_type apprenticeship.work_type not null default 'book',
  genre text check (genre is null or length(genre) <= 200),
  original_year integer check (original_year is null or original_year between -3000 and 3000),
  original_year_approximate boolean not null default false,
  year_note text check (year_note is null or length(year_note) <= 500),
  description text check (description is null or length(description) <= 20000),
  cover_url text check (cover_url is null or cover_url ~* '^https?://'),
  sources text check (sources is null or length(sources) <= 5000),
  verification_note text check (verification_note is null or length(verification_note) <= 5000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (author_id, owner_id) references apprenticeship.authors (id, owner_id)
);
create index works_owner_idx on apprenticeship.works (owner_id);
create index works_author_idx on apprenticeship.works (author_id);

-- A particular publication, translation, abridgment or format of a work.
create table apprenticeship.editions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  work_id uuid not null,
  edition_title text check (edition_title is null or length(edition_title) <= 500),
  publisher text check (publisher is null or length(publisher) <= 300),
  publication_year integer check (publication_year is null or publication_year between 1000 and 3000),
  isbn text check (isbn is null or isbn ~ '^[0-9Xx-]{10,17}$'),
  translator text check (translator is null or length(translator) <= 300),
  editor text check (editor is null or length(editor) <= 300),
  format apprenticeship.edition_format,
  page_count integer check (page_count is null or page_count between 1 and 100000),
  abridged boolean,
  external_url text check (external_url is null or external_url ~* '^https?://'),
  notes text check (notes is null or length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, work_id),
  foreign key (work_id, owner_id) references apprenticeship.works (id, owner_id) on delete cascade
);
create index editions_owner_idx on apprenticeship.editions (owner_id);
create index editions_work_idx on apprenticeship.editions (work_id);
create index editions_isbn_idx on apprenticeship.editions (owner_id, isbn) where isbn is not null;

-- Collection membership: a collection is itself a work (work_type 'collection')
-- that contains other works. Membership may overlap across collections.
create table apprenticeship.collection_members (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection_work_id uuid not null,
  member_work_id uuid not null,
  position integer not null default 0,
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),
  primary key (collection_work_id, member_work_id),
  check (collection_work_id <> member_work_id),
  foreign key (collection_work_id, owner_id) references apprenticeship.works (id, owner_id) on delete cascade,
  foreign key (member_work_id, owner_id) references apprenticeship.works (id, owner_id) on delete cascade
);
create index collection_members_owner_idx on apprenticeship.collection_members (owner_id);
create index collection_members_member_idx on apprenticeship.collection_members (member_work_id);

-- ---------------------------------------------------------------------------
-- Apprenticeships (seasons)
-- ---------------------------------------------------------------------------

create table apprenticeship.apprenticeships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  purpose text check (purpose is null or length(purpose) <= 20000),
  start_date date,
  target_end_date date,
  status apprenticeship.season_status not null default 'planned',
  archived_from_status apprenticeship.season_status,
  completed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  check (target_end_date is null or start_date is null or target_end_date >= start_date),
  foreign key (author_id, owner_id) references apprenticeship.authors (id, owner_id)
);
create index apprenticeships_owner_idx on apprenticeship.apprenticeships (owner_id, status);
create index apprenticeships_author_idx on apprenticeship.apprenticeships (author_id);

-- History of status and date changes (pause, resume, revised dates). Written
-- only by trigger; readable by the owner.
create table apprenticeship.season_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  from_status apprenticeship.season_status,
  to_status apprenticeship.season_status,
  start_date date,
  target_end_date date,
  occurred_at timestamptz not null default now(),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade
);
create index season_events_owner_idx on apprenticeship.season_events (owner_id);
create index season_events_apprenticeship_idx on apprenticeship.season_events (apprenticeship_id, occurred_at);

-- Immutable records of scope and route at completion (or any explicit
-- snapshot). Insert-only: no update or delete privileges are granted.
create table apprenticeship.season_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  reason text not null default 'completed' check (reason in ('completed', 'manual')),
  note text check (note is null or length(note) <= 5000),
  data jsonb not null,
  taken_at timestamptz not null default now(),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade
);
create index season_snapshots_owner_idx on apprenticeship.season_snapshots (owner_id);
create index season_snapshots_apprenticeship_idx on apprenticeship.season_snapshots (apprenticeship_id, taken_at);

-- Selected body of work for a season, with scope.
create table apprenticeship.apprenticeship_works (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  work_id uuid not null,
  scope apprenticeship.scope_level not null default 'essential',
  selection_note text check (selection_note is null or length(selection_note) <= 5000),
  favorite boolean not null default false,
  favorite_note text check (favorite_note is null or length(favorite_note) <= 5000),
  keep_for_guide boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (apprenticeship_id, work_id),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade,
  foreign key (work_id, owner_id) references apprenticeship.works (id, owner_id) on delete cascade
);
create index apprenticeship_works_owner_idx on apprenticeship.apprenticeship_works (owner_id);
create index apprenticeship_works_work_idx on apprenticeship.apprenticeship_works (work_id);

-- ---------------------------------------------------------------------------
-- Route
-- ---------------------------------------------------------------------------

create table apprenticeship.route_sections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text check (description is null or length(description) <= 5000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, apprenticeship_id),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade
);
create index route_sections_owner_idx on apprenticeship.route_sections (owner_id);
create index route_sections_apprenticeship_idx on apprenticeship.route_sections (apprenticeship_id, position);

-- A step can only reference a work selected for the same season, and a
-- section of the same season.
create table apprenticeship.route_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  work_id uuid not null,
  section_id uuid,
  position integer not null default 0,
  rationale text check (rationale is null or length(rationale) <= 5000),
  target_month date check (target_month is null or extract(day from target_month) = 1),
  origin apprenticeship.route_origin not null default 'mine',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (apprenticeship_id, work_id),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade,
  foreign key (apprenticeship_id, work_id) references apprenticeship.apprenticeship_works (apprenticeship_id, work_id) on delete cascade,
  foreign key (section_id, apprenticeship_id) references apprenticeship.route_sections (id, apprenticeship_id) on delete set null (section_id)
);
create index route_steps_owner_idx on apprenticeship.route_steps (owner_id);
create index route_steps_apprenticeship_idx on apprenticeship.route_steps (apprenticeship_id, position);
create index route_steps_section_idx on apprenticeship.route_steps (section_id);
create index route_steps_work_idx on apprenticeship.route_steps (apprenticeship_id, work_id);

-- Optional monthly intentions (no schedules, no overdue state).
create table apprenticeship.route_intentions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  month date not null check (extract(day from month) = 1),
  intention text not null check (length(btrim(intention)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (apprenticeship_id, month),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade
);
create index route_intentions_owner_idx on apprenticeship.route_intentions (owner_id);

-- ---------------------------------------------------------------------------
-- Reading sessions
-- ---------------------------------------------------------------------------

-- Each reading or rereading of a work is its own session. A session's work
-- must be part of the season's selected works; removing a work that has
-- reading history is refused (NO ACTION) so history is preserved.
create table apprenticeship.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  work_id uuid not null,
  edition_id uuid,
  status apprenticeship.session_status not null default 'not_started',
  is_primary boolean not null default false,
  ordinal integer not null default 1 check (ordinal >= 1),
  started_on date,
  finished_on date,
  position_kind apprenticeship.position_kind,
  position_value text check (position_value is null or length(position_value) <= 500),
  position_updated_at timestamptz,
  reflection text check (reflection is null or length(reflection) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, apprenticeship_id),
  check (finished_on is null or started_on is null or finished_on >= started_on),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade,
  foreign key (work_id, owner_id) references apprenticeship.works (id, owner_id),
  foreign key (apprenticeship_id, work_id) references apprenticeship.apprenticeship_works (apprenticeship_id, work_id),
  foreign key (edition_id, owner_id) references apprenticeship.editions (id, owner_id) on delete set null (edition_id),
  foreign key (edition_id, work_id) references apprenticeship.editions (id, work_id) on delete set null (edition_id)
);
create index reading_sessions_owner_idx on apprenticeship.reading_sessions (owner_id);
create index reading_sessions_apprenticeship_idx on apprenticeship.reading_sessions (apprenticeship_id, status);
create index reading_sessions_work_idx on apprenticeship.reading_sessions (work_id);
create index reading_sessions_edition_idx on apprenticeship.reading_sessions (edition_id);
create unique index reading_sessions_one_primary
  on apprenticeship.reading_sessions (apprenticeship_id) where is_primary;

-- ---------------------------------------------------------------------------
-- Notebook
-- ---------------------------------------------------------------------------

-- quote_* columns hold the author's words; body_html holds the reader's own
-- words. provenance marks imported or AI-suggested material. The id may be
-- generated on the client so offline captures sync idempotently.
create table apprenticeship.entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  work_id uuid,
  session_id uuid,
  edition_id uuid,
  kind apprenticeship.entry_kind not null,
  title text check (title is null or length(title) <= 500),
  body_html text check (body_html is null or length(body_html) <= 200000),
  quote_text text check (quote_text is null or length(quote_text) <= 20000),
  quote_locator text check (quote_locator is null or length(quote_locator) <= 500),
  quote_source text check (quote_source is null or length(quote_source) <= 2000),
  provenance apprenticeship.provenance not null default 'mine',
  provenance_note text check (provenance_note is null or length(provenance_note) <= 2000),
  question_status apprenticeship.question_status,
  prompt text check (prompt is null or length(prompt) <= 500),
  keep_for_guide boolean not null default false,
  favorite boolean not null default false,
  revision integer not null default 1,
  captured_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  body_text text generated always as (
    regexp_replace(coalesce(body_html, ''), '<[^>]*>', ' ', 'g')
  ) stored,
  search tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(quote_text, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig,
      regexp_replace(coalesce(body_html, ''), '<[^>]*>', ' ', 'g')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(quote_source, '')), 'C')
  ) stored,
  unique (id, owner_id),
  unique (id, apprenticeship_id),
  check (kind <> 'quotation' or length(btrim(coalesce(quote_text, ''))) > 0),
  check (kind = 'question' or question_status is null),
  check (kind <> 'question' or question_status is not null),
  check (kind = 'quotation' or length(btrim(coalesce(body_html, ''))) > 0
         or length(btrim(coalesce(title, ''))) > 0),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade,
  foreign key (work_id, owner_id) references apprenticeship.works (id, owner_id) on delete set null (work_id),
  foreign key (session_id, owner_id) references apprenticeship.reading_sessions (id, owner_id) on delete set null (session_id),
  foreign key (session_id, apprenticeship_id) references apprenticeship.reading_sessions (id, apprenticeship_id) on delete set null (session_id),
  foreign key (edition_id, owner_id) references apprenticeship.editions (id, owner_id) on delete set null (edition_id)
);
create index entries_owner_idx on apprenticeship.entries (owner_id);
create index entries_apprenticeship_idx on apprenticeship.entries (apprenticeship_id, captured_at desc);
create index entries_work_idx on apprenticeship.entries (work_id);
create index entries_session_idx on apprenticeship.entries (session_id);
create index entries_edition_idx on apprenticeship.entries (edition_id);
create index entries_questions_idx on apprenticeship.entries (apprenticeship_id, question_status)
  where kind = 'question';
create index entries_search_idx on apprenticeship.entries using gin (search);

-- Earlier versions of an entry, kept whenever its words change, so earlier
-- interpretations remain intact. Written only by trigger.
create table apprenticeship.entry_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  entry_id uuid not null,
  revision integer not null,
  title text,
  body_html text,
  quote_text text,
  quote_locator text,
  quote_source text,
  question_status apprenticeship.question_status,
  recorded_at timestamptz not null default now(),
  foreign key (entry_id, owner_id) references apprenticeship.entries (id, owner_id) on delete cascade
);
create index entry_versions_owner_idx on apprenticeship.entry_versions (owner_id);
create index entry_versions_entry_idx on apprenticeship.entry_versions (entry_id, revision);

create table apprenticeship.themes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  description_html text check (description_html is null or length(description_html) <= 200000),
  synthesis_html text check (synthesis_html is null or length(synthesis_html) <= 200000),
  continues_theme_id uuid,
  keep_for_guide boolean not null default false,
  revision integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, apprenticeship_id),
  check (continues_theme_id is null or continues_theme_id <> id),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade,
  foreign key (continues_theme_id, owner_id) references apprenticeship.themes (id, owner_id) on delete set null (continues_theme_id)
);
create unique index themes_name_unique on apprenticeship.themes (apprenticeship_id, lower(name));
create index themes_owner_idx on apprenticeship.themes (owner_id);
create index themes_continues_idx on apprenticeship.themes (continues_theme_id);

create table apprenticeship.entry_themes (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  entry_id uuid not null,
  theme_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, theme_id),
  foreign key (entry_id, owner_id) references apprenticeship.entries (id, owner_id) on delete cascade,
  foreign key (theme_id, owner_id) references apprenticeship.themes (id, owner_id) on delete cascade,
  foreign key (entry_id, apprenticeship_id) references apprenticeship.entries (id, apprenticeship_id) on delete cascade,
  foreign key (theme_id, apprenticeship_id) references apprenticeship.themes (id, apprenticeship_id) on delete cascade
);
create index entry_themes_owner_idx on apprenticeship.entry_themes (owner_id);
create index entry_themes_theme_idx on apprenticeship.entry_themes (theme_id);
create index entry_themes_apprenticeship_idx on apprenticeship.entry_themes (apprenticeship_id);

-- Explicit connections between entries (may span seasons of the same owner).
create table apprenticeship.entry_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_entry_id uuid not null,
  to_entry_id uuid not null,
  relation apprenticeship.link_relation not null default 'related',
  note text check (note is null or length(note) <= 5000),
  created_at timestamptz not null default now(),
  unique (from_entry_id, to_entry_id, relation),
  check (from_entry_id <> to_entry_id),
  foreign key (from_entry_id, owner_id) references apprenticeship.entries (id, owner_id) on delete cascade,
  foreign key (to_entry_id, owner_id) references apprenticeship.entries (id, owner_id) on delete cascade
);
create index entry_links_owner_idx on apprenticeship.entry_links (owner_id);
create index entry_links_to_idx on apprenticeship.entry_links (to_entry_id);

-- Traveling questions: a question carried into another work (possibly in a
-- later season). Subsequent observations attach via entry_links.
create table apprenticeship.question_carries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_entry_id uuid not null,
  apprenticeship_id uuid not null,
  work_id uuid,
  note text check (note is null or length(note) <= 5000),
  created_at timestamptz not null default now(),
  foreign key (question_entry_id, owner_id) references apprenticeship.entries (id, owner_id) on delete cascade,
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade,
  foreign key (apprenticeship_id, work_id) references apprenticeship.apprenticeship_works (apprenticeship_id, work_id) on delete cascade
);
create unique index question_carries_unique
  on apprenticeship.question_carries (question_entry_id, apprenticeship_id, work_id) nulls not distinct;
create index question_carries_owner_idx on apprenticeship.question_carries (owner_id);
create index question_carries_target_idx on apprenticeship.question_carries (apprenticeship_id, work_id);

-- ---------------------------------------------------------------------------
-- Inheritance and retrospective
-- ---------------------------------------------------------------------------

create table apprenticeship.inheritance_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  takeaway_html text check (takeaway_html is null or length(takeaway_html) <= 200000),
  category apprenticeship.inheritance_category not null default 'other',
  practical_intention text check (practical_intention is null or length(practical_intention) <= 5000),
  noted_on date not null default current_date,
  favorite boolean not null default false,
  keep_for_guide boolean not null default false,
  revision integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade
);
create index inheritance_entries_owner_idx on apprenticeship.inheritance_entries (owner_id);
create index inheritance_entries_apprenticeship_idx on apprenticeship.inheritance_entries (apprenticeship_id, noted_on desc);

create table apprenticeship.inheritance_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  inheritance_id uuid not null,
  work_id uuid,
  entry_id uuid,
  created_at timestamptz not null default now(),
  check (num_nonnulls(work_id, entry_id) = 1),
  foreign key (inheritance_id, owner_id) references apprenticeship.inheritance_entries (id, owner_id) on delete cascade,
  foreign key (work_id, owner_id) references apprenticeship.works (id, owner_id) on delete cascade,
  foreign key (entry_id, owner_id) references apprenticeship.entries (id, owner_id) on delete cascade
);
create unique index inheritance_links_work_unique
  on apprenticeship.inheritance_links (inheritance_id, work_id) where work_id is not null;
create unique index inheritance_links_entry_unique
  on apprenticeship.inheritance_links (inheritance_id, entry_id) where entry_id is not null;
create index inheritance_links_owner_idx on apprenticeship.inheritance_links (owner_id);
create index inheritance_links_work_idx on apprenticeship.inheritance_links (work_id);
create index inheritance_links_entry_idx on apprenticeship.inheritance_links (entry_id);

-- The reader's editable commentary for each retrospective section. Listed
-- material (works read, kept quotations, themes, open questions) is assembled
-- from saved records at read time rather than copied here.
create table apprenticeship.retrospectives (
  apprenticeship_id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  why_began_html text check (why_began_html is null or length(why_began_html) <= 200000),
  works_read_html text check (works_read_html is null or length(works_read_html) <= 200000),
  favorites_html text check (favorites_html is null or length(favorites_html) <= 200000),
  quotations_html text check (quotations_html is null or length(quotations_html) <= 200000),
  themes_html text check (themes_html is null or length(themes_html) <= 200000),
  questions_html text check (questions_html is null or length(questions_html) <= 200000),
  recommended_order_html text check (recommended_order_html is null or length(recommended_order_html) <= 200000),
  carrying_forward_html text check (carrying_forward_html is null or length(carrying_forward_html) <= 200000),
  concluding_essay_html text check (concluding_essay_html is null or length(concluding_essay_html) <= 400000),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade
);
create index retrospectives_owner_idx on apprenticeship.retrospectives (owner_id);

-- ---------------------------------------------------------------------------
-- Labeled links to records in other apps (no integration assumed)
-- ---------------------------------------------------------------------------

create table apprenticeship.external_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apprenticeship_id uuid,
  author_id uuid,
  work_id uuid,
  edition_id uuid,
  app apprenticeship.external_app not null default 'other',
  label text not null check (length(btrim(label)) between 1 and 300),
  url text not null check (url ~* '^https?://' and length(url) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(apprenticeship_id, author_id, work_id, edition_id) = 1),
  foreign key (apprenticeship_id, owner_id) references apprenticeship.apprenticeships (id, owner_id) on delete cascade,
  foreign key (author_id, owner_id) references apprenticeship.authors (id, owner_id) on delete cascade,
  foreign key (work_id, owner_id) references apprenticeship.works (id, owner_id) on delete cascade,
  foreign key (edition_id, owner_id) references apprenticeship.editions (id, owner_id) on delete cascade
);
create index external_links_owner_idx on apprenticeship.external_links (owner_id);
create index external_links_apprenticeship_idx on apprenticeship.external_links (apprenticeship_id);
create index external_links_author_idx on apprenticeship.external_links (author_id);
create index external_links_work_idx on apprenticeship.external_links (work_id);
create index external_links_edition_idx on apprenticeship.external_links (edition_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger touch before update on apprenticeship.authors
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.author_facts
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.works
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.editions
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.apprenticeships
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.apprenticeship_works
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.route_sections
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.route_steps
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.route_intentions
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.reading_sessions
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.external_links
  for each row execute function apprenticeship.tg_touch();
create trigger touch before update on apprenticeship.entries
  for each row execute function apprenticeship.tg_touch_revision();
create trigger touch before update on apprenticeship.themes
  for each row execute function apprenticeship.tg_touch_revision();
create trigger touch before update on apprenticeship.inheritance_entries
  for each row execute function apprenticeship.tg_touch_revision();
create trigger touch before update on apprenticeship.retrospectives
  for each row execute function apprenticeship.tg_touch_revision();

-- Tables whose owner can never change and which have no updated_at.
create function apprenticeship.tg_guard_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Ownership cannot be reassigned' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_owner before update on apprenticeship.collection_members
  for each row execute function apprenticeship.tg_guard_owner();
create trigger guard_owner before update on apprenticeship.entry_themes
  for each row execute function apprenticeship.tg_guard_owner();
create trigger guard_owner before update on apprenticeship.entry_links
  for each row execute function apprenticeship.tg_guard_owner();
create trigger guard_owner before update on apprenticeship.question_carries
  for each row execute function apprenticeship.tg_guard_owner();
create trigger guard_owner before update on apprenticeship.inheritance_links
  for each row execute function apprenticeship.tg_guard_owner();

-- Keep earlier wording of entries. SECURITY DEFINER so the history table can
-- stay read-only for clients; it only ever copies the row being updated,
-- which RLS has already confirmed belongs to the caller.
create function apprenticeship.tg_entry_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.title, old.body_html, old.quote_text, old.quote_locator, old.quote_source, old.question_status)
     is distinct from
     (new.title, new.body_html, new.quote_text, new.quote_locator, new.quote_source, new.question_status) then
    insert into apprenticeship.entry_versions
      (owner_id, entry_id, revision, title, body_html, quote_text, quote_locator, quote_source, question_status)
    values
      (old.owner_id, old.id, old.revision, old.title, old.body_html, old.quote_text, old.quote_locator,
       old.quote_source, old.question_status);
  end if;
  return new;
end;
$$;

create trigger keep_versions after update on apprenticeship.entries
  for each row execute function apprenticeship.tg_entry_versions();

-- Season history: record creation, status changes and revised dates.
create function apprenticeship.tg_season_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into apprenticeship.season_events
      (owner_id, apprenticeship_id, from_status, to_status, start_date, target_end_date)
    values (new.owner_id, new.id, null, new.status, new.start_date, new.target_end_date);
  elsif (old.status, old.start_date, old.target_end_date)
        is distinct from (new.status, new.start_date, new.target_end_date) then
    insert into apprenticeship.season_events
      (owner_id, apprenticeship_id, from_status, to_status, start_date, target_end_date)
    values (new.owner_id, new.id, old.status, new.status, new.start_date, new.target_end_date);
  end if;
  return null;
end;
$$;

create trigger season_events after insert or update on apprenticeship.apprenticeships
  for each row execute function apprenticeship.tg_season_events();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
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
    execute format('alter table apprenticeship.%I enable row level security', t);

    execute format(
      'create policy "Owners read their rows" on apprenticeship.%I
         for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "Owners add their rows" on apprenticeship.%I
         for insert to authenticated with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "Owners change their rows" on apprenticeship.%I
         for update to authenticated
         using (owner_id = (select auth.uid()))
         with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "Owners remove their rows" on apprenticeship.%I
         for delete to authenticated using (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "No anonymous identities" on apprenticeship.%I
         as restrictive for all to authenticated
         using (not coalesce(((select auth.jwt()) ->> %L)::boolean, false))
         with check (not coalesce(((select auth.jwt()) ->> %L)::boolean, false))',
      t, 'is_anonymous', 'is_anonymous');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Functions (SECURITY INVOKER: RLS applies to everything they touch)
-- ---------------------------------------------------------------------------

-- Atomically apply a new route order. Steps not listed keep their position.
create function apprenticeship.reorder_route(p_apprenticeship_id uuid, p_step_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update apprenticeship.route_steps s
     set position = t.ord::integer
    from unnest(p_step_ids) with ordinality as t(id, ord)
   where s.id = t.id
     and s.apprenticeship_id = p_apprenticeship_id;
$$;

-- Designate one current reading as primary for its season.
create function apprenticeship.set_primary_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_apprenticeship uuid;
begin
  select apprenticeship_id into v_apprenticeship
    from apprenticeship.reading_sessions where id = p_session_id;
  if v_apprenticeship is null then
    raise exception 'Reading session not found' using errcode = 'P0002';
  end if;
  update apprenticeship.reading_sessions
     set is_primary = false
   where apprenticeship_id = v_apprenticeship and is_primary and id <> p_session_id;
  update apprenticeship.reading_sessions set is_primary = true where id = p_session_id;
end;
$$;

-- Record a snapshot of scope, route and reading history. Used at completion so
-- that later changes never silently rewrite what the season looked like.
create function apprenticeship.take_season_snapshot(
  p_apprenticeship_id uuid,
  p_reason text default 'manual',
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from apprenticeship.apprenticeships where id = p_apprenticeship_id) then
    raise exception 'Apprenticeship not found' using errcode = 'P0002';
  end if;

  insert into apprenticeship.season_snapshots (apprenticeship_id, reason, note, data)
  values (
    p_apprenticeship_id,
    p_reason,
    p_note,
    jsonb_build_object(
      'apprenticeship', (
        select jsonb_build_object(
          'title', a.title, 'purpose', a.purpose, 'status', a.status,
          'start_date', a.start_date, 'target_end_date', a.target_end_date,
          'completed_on', a.completed_on, 'author', au.name)
          from apprenticeship.apprenticeships a
          join apprenticeship.authors au on au.id = a.author_id
         where a.id = p_apprenticeship_id),
      'scope', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'work_id', w.id, 'title', w.title, 'work_type', w.work_type,
                 'original_year', w.original_year, 'scope', aw.scope,
                 'favorite', aw.favorite, 'favorite_note', aw.favorite_note)
               order by w.original_year nulls last, w.title)
          from apprenticeship.apprenticeship_works aw
          join apprenticeship.works w on w.id = aw.work_id
         where aw.apprenticeship_id = p_apprenticeship_id), '[]'::jsonb),
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', rs.id, 'title', rs.title, 'description', rs.description,
                 'position', rs.position) order by rs.position)
          from apprenticeship.route_sections rs
         where rs.apprenticeship_id = p_apprenticeship_id), '[]'::jsonb),
      'route', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'work_id', st.work_id, 'title', w.title, 'section_id', st.section_id,
                 'position', st.position, 'rationale', st.rationale,
                 'target_month', st.target_month, 'origin', st.origin)
               order by st.position, st.created_at)
          from apprenticeship.route_steps st
          join apprenticeship.works w on w.id = st.work_id
         where st.apprenticeship_id = p_apprenticeship_id), '[]'::jsonb),
      'sessions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', s.id, 'work_id', s.work_id, 'title', w.title, 'status', s.status,
                 'ordinal', s.ordinal, 'started_on', s.started_on,
                 'finished_on', s.finished_on)
               order by s.started_on nulls last, s.created_at)
          from apprenticeship.reading_sessions s
          join apprenticeship.works w on w.id = s.work_id
         where s.apprenticeship_id = p_apprenticeship_id), '[]'::jsonb)
    )
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Complete a season (whether or not every selected work was finished) and
-- preserve its scope and route as they stood.
create function apprenticeship.complete_apprenticeship(
  p_apprenticeship_id uuid,
  p_completed_on date default null,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update apprenticeship.apprenticeships
     set status = 'completed',
         archived_from_status = null,
         completed_on = coalesce(p_completed_on, current_date)
   where id = p_apprenticeship_id;
  if not found then
    raise exception 'Apprenticeship not found' using errcode = 'P0002';
  end if;
  return apprenticeship.take_season_snapshot(p_apprenticeship_id, 'completed', p_note);
end;
$$;

-- Search titles, notes, questions, themes, works and inheritance in a season.
create function apprenticeship.search_apprenticeship(p_apprenticeship_id uuid, p_query text)
returns table (
  result_type text,
  id uuid,
  title text,
  snippet text,
  work_id uuid,
  entry_kind apprenticeship.entry_kind,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select websearch_to_tsquery('english'::regconfig, p_query) as tsq,
           '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select * from (
    select 'entry'::text, e.id,
           coalesce(nullif(e.title, ''), left(coalesce(nullif(e.quote_text, ''), e.body_text), 120)),
           left(coalesce(nullif(btrim(e.body_text), ''), e.quote_text, ''), 280),
           e.work_id, e.kind,
           (ts_rank(e.search, q.tsq) + 0.01)::real
      from apprenticeship.entries e, q
     where e.apprenticeship_id = p_apprenticeship_id
       and e.archived_at is null
       and (e.search @@ q.tsq or e.title ilike q.pat or e.quote_text ilike q.pat
            or e.body_text ilike q.pat or e.quote_source ilike q.pat)
    union all
    select 'theme', t.id, t.name,
           left(regexp_replace(coalesce(t.description_html, '') || ' ' || coalesce(t.synthesis_html, ''), '<[^>]*>', ' ', 'g'), 280),
           null::uuid, null::apprenticeship.entry_kind, 0.5::real
      from apprenticeship.themes t, q
     where t.apprenticeship_id = p_apprenticeship_id
       and t.archived_at is null
       and (t.name ilike q.pat or t.description_html ilike q.pat or t.synthesis_html ilike q.pat)
    union all
    select 'work', w.id, w.title, left(coalesce(w.description, ''), 280), w.id,
           null::apprenticeship.entry_kind, 0.6::real
      from apprenticeship.apprenticeship_works aw
      join apprenticeship.works w on w.id = aw.work_id, q
     where aw.apprenticeship_id = p_apprenticeship_id
       and (w.title ilike q.pat or w.description ilike q.pat or w.genre ilike q.pat)
    union all
    select 'inheritance', i.id, i.title,
           left(regexp_replace(coalesce(i.takeaway_html, ''), '<[^>]*>', ' ', 'g') || ' ' || coalesce(i.practical_intention, ''), 280),
           null::uuid, null::apprenticeship.entry_kind, 0.4::real
      from apprenticeship.inheritance_entries i, q
     where i.apprenticeship_id = p_apprenticeship_id
       and i.archived_at is null
       and (i.title ilike q.pat or i.takeaway_html ilike q.pat or i.practical_intention ilike q.pat)
  ) r (result_type, id, title, snippet, work_id, entry_kind, rank)
  order by rank desc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated users only; RLS decides which rows.
-- ---------------------------------------------------------------------------

revoke all on schema apprenticeship from public, anon;
grant usage on schema apprenticeship to authenticated, service_role;

revoke all on all tables in schema apprenticeship from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema apprenticeship to authenticated;
-- History and snapshots are append-only from the client's point of view.
revoke insert, update, delete on apprenticeship.season_events from authenticated;
revoke insert, update, delete on apprenticeship.entry_versions from authenticated;
revoke update, delete on apprenticeship.season_snapshots from authenticated;
grant all on all tables in schema apprenticeship to service_role;

revoke all on all functions in schema apprenticeship from public, anon;
grant execute on function apprenticeship.reorder_route(uuid, uuid[]) to authenticated;
grant execute on function apprenticeship.set_primary_session(uuid) to authenticated;
grant execute on function apprenticeship.take_season_snapshot(uuid, text, text) to authenticated;
grant execute on function apprenticeship.complete_apprenticeship(uuid, date, text) to authenticated;
grant execute on function apprenticeship.search_apprenticeship(uuid, text) to authenticated;
grant execute on all functions in schema apprenticeship to service_role;

-- Future objects created by the migration role in this schema follow the same
-- rule: nothing for anon.
alter default privileges in schema apprenticeship revoke all on tables from public, anon;
alter default privileges in schema apprenticeship revoke all on functions from public, anon;
alter default privileges in schema apprenticeship revoke all on sequences from public, anon;
