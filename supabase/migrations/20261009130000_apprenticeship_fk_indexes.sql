-- Follow-up to apprenticeship_schema (Supabase advisor finding): cover every
-- composite (ownership) foreign key with an index whose leading columns match
-- it. The earlier single-column indexes are intentionally kept; they are small
-- prefixes of these and harmless.
--
-- On the hosted project this file was applied in six batches named
-- apprenticeship_fk_indexes, apprenticeship_fk_indexes_2 ... _5 (the Supabase
-- MCP tool times out on long DDL batches). The result is identical.

create index apprenticeship_works_apprenticeship_id_owner_id_idx on apprenticeship.apprenticeship_works (apprenticeship_id, owner_id);
create index apprenticeship_works_work_id_owner_id_idx on apprenticeship.apprenticeship_works (work_id, owner_id);
create index apprenticeships_author_id_owner_id_idx on apprenticeship.apprenticeships (author_id, owner_id);
create index author_facts_author_id_owner_id_idx on apprenticeship.author_facts (author_id, owner_id);
create index collection_members_collection_work_id_owner_id_idx on apprenticeship.collection_members (collection_work_id, owner_id);
create index collection_members_member_work_id_owner_id_idx on apprenticeship.collection_members (member_work_id, owner_id);
create index editions_work_id_owner_id_idx on apprenticeship.editions (work_id, owner_id);
create index entries_apprenticeship_id_owner_id_idx on apprenticeship.entries (apprenticeship_id, owner_id);
create index entries_edition_id_owner_id_idx on apprenticeship.entries (edition_id, owner_id);
create index entries_session_id_apprenticeship_id_idx on apprenticeship.entries (session_id, apprenticeship_id);
create index entries_session_id_owner_id_idx on apprenticeship.entries (session_id, owner_id);
create index entries_work_id_owner_id_idx on apprenticeship.entries (work_id, owner_id);
create index entry_links_from_entry_id_owner_id_idx on apprenticeship.entry_links (from_entry_id, owner_id);
create index entry_links_to_entry_id_owner_id_idx on apprenticeship.entry_links (to_entry_id, owner_id);
create index entry_themes_entry_id_apprenticeship_id_idx on apprenticeship.entry_themes (entry_id, apprenticeship_id);
create index entry_themes_entry_id_owner_id_idx on apprenticeship.entry_themes (entry_id, owner_id);
create index entry_themes_theme_id_apprenticeship_id_idx on apprenticeship.entry_themes (theme_id, apprenticeship_id);
create index entry_themes_theme_id_owner_id_idx on apprenticeship.entry_themes (theme_id, owner_id);
create index entry_versions_entry_id_owner_id_idx on apprenticeship.entry_versions (entry_id, owner_id);
create index external_links_apprenticeship_id_owner_id_idx on apprenticeship.external_links (apprenticeship_id, owner_id);
create index external_links_author_id_owner_id_idx on apprenticeship.external_links (author_id, owner_id);
create index external_links_edition_id_owner_id_idx on apprenticeship.external_links (edition_id, owner_id);
create index external_links_work_id_owner_id_idx on apprenticeship.external_links (work_id, owner_id);
create index inheritance_entries_apprenticeship_id_owner_id_idx on apprenticeship.inheritance_entries (apprenticeship_id, owner_id);
create index inheritance_links_entry_id_owner_id_idx on apprenticeship.inheritance_links (entry_id, owner_id);
create index inheritance_links_inheritance_id_owner_id_idx on apprenticeship.inheritance_links (inheritance_id, owner_id);
create index inheritance_links_work_id_owner_id_idx on apprenticeship.inheritance_links (work_id, owner_id);
create index question_carries_apprenticeship_id_owner_id_idx on apprenticeship.question_carries (apprenticeship_id, owner_id);
create index question_carries_question_entry_id_owner_id_idx on apprenticeship.question_carries (question_entry_id, owner_id);
create index reading_sessions_apprenticeship_id_owner_id_idx on apprenticeship.reading_sessions (apprenticeship_id, owner_id);
create index reading_sessions_apprenticeship_id_work_id_idx on apprenticeship.reading_sessions (apprenticeship_id, work_id);
create index reading_sessions_edition_id_owner_id_idx on apprenticeship.reading_sessions (edition_id, owner_id);
create index reading_sessions_edition_id_work_id_idx on apprenticeship.reading_sessions (edition_id, work_id);
create index reading_sessions_work_id_owner_id_idx on apprenticeship.reading_sessions (work_id, owner_id);
create index retrospectives_apprenticeship_id_owner_id_idx on apprenticeship.retrospectives (apprenticeship_id, owner_id);
create index route_intentions_apprenticeship_id_owner_id_idx on apprenticeship.route_intentions (apprenticeship_id, owner_id);
create index route_sections_apprenticeship_id_owner_id_idx on apprenticeship.route_sections (apprenticeship_id, owner_id);
create index route_steps_apprenticeship_id_owner_id_idx on apprenticeship.route_steps (apprenticeship_id, owner_id);
create index route_steps_section_id_apprenticeship_id_idx on apprenticeship.route_steps (section_id, apprenticeship_id);
create index season_events_apprenticeship_id_owner_id_idx on apprenticeship.season_events (apprenticeship_id, owner_id);
create index season_snapshots_apprenticeship_id_owner_id_idx on apprenticeship.season_snapshots (apprenticeship_id, owner_id);
create index themes_apprenticeship_id_owner_id_idx on apprenticeship.themes (apprenticeship_id, owner_id);
create index themes_continues_theme_id_owner_id_idx on apprenticeship.themes (continues_theme_id, owner_id);
create index works_author_id_owner_id_idx on apprenticeship.works (author_id, owner_id);
