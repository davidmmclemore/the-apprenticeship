import { supabase } from "./supabase";
import { RemoteError, type EntryRemote } from "./local/sync";
import type {
  Apprenticeship,
  ApprenticeshipWork,
  Author,
  AuthorFact,
  CollectionMember,
  Edition,
  Entry,
  EntryLink,
  EntryTheme,
  EntryVersion,
  EntryWrite,
  ExternalLink,
  InheritanceEntry,
  InheritanceLink,
  QuestionCarry,
  ReadingSession,
  Retrospective,
  RouteIntention,
  RouteSection,
  RouteStep,
  SearchResult,
  SeasonEvent,
  SeasonSnapshot,
  Theme,
  Work,
} from "./types";

/*
 * Data access for the `apprenticeship` schema. Every query relies on RLS for
 * ownership; no function here filters by user id, and none could reach
 * another user's rows if it tried.
 */

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

function isNetworkFailure(error: { message?: string } | null): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return Boolean(error?.message && /Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(error.message));
}

async function run<T>(query: PromiseLike<Result<T>>): Promise<T> {
  let res: Result<T>;
  try {
    res = await query;
  } catch (e) {
    throw new RemoteError(e instanceof Error ? e.message : String(e), null, true);
  }
  if (res.error) {
    throw new RemoteError(res.error.message, res.error.code ?? null, isNetworkFailure(res.error));
  }
  return res.data as T;
}

const db = () => supabase();

// Authors -------------------------------------------------------------------

export const listAuthors = () => run<Author[]>(db().from("authors").select("*").order("name"));

export const createAuthor = (values: Partial<Author>) =>
  run<Author>(db().from("authors").insert(values).select().single());

export const updateAuthor = (id: string, values: Partial<Author>) =>
  run<Author>(db().from("authors").update(values).eq("id", id).select().single());

export const listAuthorFacts = (authorId: string) =>
  run<AuthorFact[]>(db().from("author_facts").select("*").eq("author_id", authorId).order("year", { ascending: true, nullsFirst: false }));

export const createAuthorFact = (values: Partial<AuthorFact>) =>
  run<AuthorFact>(db().from("author_facts").insert(values).select().single());

export const updateAuthorFact = (id: string, values: Partial<AuthorFact>) =>
  run<AuthorFact>(db().from("author_facts").update(values).eq("id", id).select().single());

export const deleteAuthorFact = (id: string) => run(db().from("author_facts").delete().eq("id", id));

// Apprenticeships -----------------------------------------------------------

export const listSeasons = () =>
  run<Apprenticeship[]>(db().from("apprenticeships").select("*").order("updated_at", { ascending: false }));

export const getSeason = (id: string) =>
  run<Apprenticeship | null>(db().from("apprenticeships").select("*").eq("id", id).maybeSingle());

export const createSeason = (values: Partial<Apprenticeship>) =>
  run<Apprenticeship>(db().from("apprenticeships").insert(values).select().single());

export const updateSeason = (id: string, values: Partial<Apprenticeship>) =>
  run<Apprenticeship>(db().from("apprenticeships").update(values).eq("id", id).select().single());

export const deleteSeason = (id: string) => run(db().from("apprenticeships").delete().eq("id", id));

export const completeSeason = (id: string, completedOn: string, note: string | null) =>
  run<string>(db().rpc("complete_apprenticeship", { p_apprenticeship_id: id, p_completed_on: completedOn, p_note: note }));

export const listSeasonEvents = (id: string) =>
  run<SeasonEvent[]>(db().from("season_events").select("*").eq("apprenticeship_id", id).order("occurred_at"));

export const listSnapshots = (id: string) =>
  run<SeasonSnapshot[]>(db().from("season_snapshots").select("*").eq("apprenticeship_id", id).order("taken_at", { ascending: false }));

// Works, editions, collections ----------------------------------------------

export const listWorks = () => run<Work[]>(db().from("works").select("*").order("title"));

export const listWorksByIds = (ids: string[]) =>
  ids.length ? run<Work[]>(db().from("works").select("*").in("id", ids)) : Promise.resolve([] as Work[]);

export const getAuthor = (id: string) => run<Author | null>(db().from("authors").select("*").eq("id", id).maybeSingle());

/** Every current reading across the reader's seasons (for the shelf). */
export const listCurrentSessions = () =>
  run<ReadingSession[]>(db().from("reading_sessions").select("*").eq("status", "reading").order("updated_at", { ascending: false }));

export const listWorksByAuthor = (authorId: string) =>
  run<Work[]>(db().from("works").select("*").eq("author_id", authorId).order("title"));

export const createWork = (values: Partial<Work>) => run<Work>(db().from("works").insert(values).select().single());

export const updateWork = (id: string, values: Partial<Work>) =>
  run<Work>(db().from("works").update(values).eq("id", id).select().single());

export const deleteWork = (id: string) => run(db().from("works").delete().eq("id", id));

export const listEditions = (workIds: string[]) =>
  workIds.length
    ? run<Edition[]>(db().from("editions").select("*").in("work_id", workIds).order("publication_year", { ascending: true, nullsFirst: false }))
    : Promise.resolve([] as Edition[]);

export const createEdition = (values: Partial<Edition>) =>
  run<Edition>(db().from("editions").insert(values).select().single());

export const updateEdition = (id: string, values: Partial<Edition>) =>
  run<Edition>(db().from("editions").update(values).eq("id", id).select().single());

export const deleteEdition = (id: string) => run(db().from("editions").delete().eq("id", id));

export const listCollectionMembers = () =>
  run<CollectionMember[]>(db().from("collection_members").select("*").order("position"));

export const addCollectionMember = (collectionWorkId: string, memberWorkId: string, position = 0) =>
  run(db().from("collection_members").insert({ collection_work_id: collectionWorkId, member_work_id: memberWorkId, position }));

export const removeCollectionMember = (collectionWorkId: string, memberWorkId: string) =>
  run(db().from("collection_members").delete().eq("collection_work_id", collectionWorkId).eq("member_work_id", memberWorkId));

// Scope ---------------------------------------------------------------------

export const listSeasonWorks = (seasonId: string) =>
  run<ApprenticeshipWork[]>(db().from("apprenticeship_works").select("*").eq("apprenticeship_id", seasonId));

export const addWorkToSeason = (values: Partial<ApprenticeshipWork> & { apprenticeship_id: string; work_id: string }) =>
  run<ApprenticeshipWork>(db().from("apprenticeship_works").insert(values).select().single());

export const updateSeasonWork = (seasonId: string, workId: string, values: Partial<ApprenticeshipWork>) =>
  run<ApprenticeshipWork>(
    db().from("apprenticeship_works").update(values).eq("apprenticeship_id", seasonId).eq("work_id", workId).select().single(),
  );

export const removeWorkFromSeason = (seasonId: string, workId: string) =>
  run(db().from("apprenticeship_works").delete().eq("apprenticeship_id", seasonId).eq("work_id", workId));

// Route ---------------------------------------------------------------------

export const listSections = (seasonId: string) =>
  run<RouteSection[]>(db().from("route_sections").select("*").eq("apprenticeship_id", seasonId).order("position"));

export const createSection = (values: Partial<RouteSection>) =>
  run<RouteSection>(db().from("route_sections").insert(values).select().single());

export const updateSection = (id: string, values: Partial<RouteSection>) =>
  run<RouteSection>(db().from("route_sections").update(values).eq("id", id).select().single());

export const deleteSection = (id: string) => run(db().from("route_sections").delete().eq("id", id));

export const listSteps = (seasonId: string) =>
  run<RouteStep[]>(db().from("route_steps").select("*").eq("apprenticeship_id", seasonId).order("position").order("created_at"));

export const createStep = (values: Partial<RouteStep>) =>
  run<RouteStep>(db().from("route_steps").insert(values).select().single());

export const createSteps = (values: Partial<RouteStep>[]) =>
  values.length ? run<RouteStep[]>(db().from("route_steps").insert(values).select()) : Promise.resolve([] as RouteStep[]);

export const updateStep = (id: string, values: Partial<RouteStep>) =>
  run<RouteStep>(db().from("route_steps").update(values).eq("id", id).select().single());

export const updateStepsWhere = (seasonId: string, values: Partial<RouteStep>) =>
  run(db().from("route_steps").update(values).eq("apprenticeship_id", seasonId));

export const deleteStep = (id: string) => run(db().from("route_steps").delete().eq("id", id));

export const reorderRoute = (seasonId: string, stepIds: string[]) =>
  run(db().rpc("reorder_route", { p_apprenticeship_id: seasonId, p_step_ids: stepIds }));

export const listIntentions = (seasonId: string) =>
  run<RouteIntention[]>(db().from("route_intentions").select("*").eq("apprenticeship_id", seasonId).order("month"));

export const createIntention = (values: Partial<RouteIntention>) =>
  run<RouteIntention>(db().from("route_intentions").insert(values).select().single());

export const updateIntention = (id: string, values: Partial<RouteIntention>) =>
  run<RouteIntention>(db().from("route_intentions").update(values).eq("id", id).select().single());

export const deleteIntention = (id: string) => run(db().from("route_intentions").delete().eq("id", id));

// Reading sessions ----------------------------------------------------------

export const listSessions = (seasonId: string) =>
  run<ReadingSession[]>(db().from("reading_sessions").select("*").eq("apprenticeship_id", seasonId).order("created_at"));

export const listSessionsForWork = (workId: string) =>
  run<ReadingSession[]>(db().from("reading_sessions").select("*").eq("work_id", workId).order("created_at"));

export const createSession = (values: Partial<ReadingSession>) =>
  run<ReadingSession>(db().from("reading_sessions").insert(values).select().single());

export const updateSession = (id: string, values: Partial<ReadingSession>) =>
  run<ReadingSession>(db().from("reading_sessions").update(values).eq("id", id).select().single());

export const deleteSession = (id: string) => run(db().from("reading_sessions").delete().eq("id", id));

export const setPrimarySession = (id: string) => run(db().rpc("set_primary_session", { p_session_id: id }));

// Notebook ------------------------------------------------------------------

export const listEntries = (seasonId: string) =>
  run<Entry[]>(db().from("entries").select(ENTRY_COLUMNS).eq("apprenticeship_id", seasonId).order("captured_at", { ascending: false }));

export const listEntriesForSeasons = (seasonIds: string[]) =>
  seasonIds.length
    ? run<Entry[]>(db().from("entries").select(ENTRY_COLUMNS).in("apprenticeship_id", seasonIds).order("captured_at", { ascending: false }))
    : Promise.resolve([] as Entry[]);

export const getEntry = (id: string) => run<Entry | null>(db().from("entries").select(ENTRY_COLUMNS).eq("id", id).maybeSingle());

export const deleteEntry = (id: string) => run(db().from("entries").delete().eq("id", id));

export const listEntryVersions = (entryId: string) =>
  run<EntryVersion[]>(db().from("entry_versions").select("*").eq("entry_id", entryId).order("revision", { ascending: false }));

const ENTRY_COLUMNS =
  "id,owner_id,apprenticeship_id,work_id,session_id,edition_id,kind,title,body_html,quote_text,quote_locator,quote_source,provenance,provenance_note,question_status,prompt,keep_for_guide,favorite,revision,captured_at,archived_at,created_at,updated_at";

export const entryRemote: EntryRemote = {
  insert: (row) => run<Entry>(db().from("entries").insert(row).select(ENTRY_COLUMNS).single()),
  fetch: (id) => getEntry(id),
  async updateIfRevision(id, baseRevision, patch) {
    const rows = await run<Entry[]>(db().from("entries").update(patch).eq("id", id).eq("revision", baseRevision).select(ENTRY_COLUMNS));
    return rows[0] ?? null;
  },
  async attachThemes(entryId, apprenticeshipId, themeIds) {
    if (!themeIds.length) return;
    await run(
      db()
        .from("entry_themes")
        .upsert(
          themeIds.map((theme_id) => ({ entry_id: entryId, theme_id, apprenticeship_id: apprenticeshipId })),
          { onConflict: "entry_id,theme_id", ignoreDuplicates: true },
        ),
    );
  },
};

export const listThemes = (seasonId: string) =>
  run<Theme[]>(db().from("themes").select("*").eq("apprenticeship_id", seasonId).order("name"));

export const listThemesForSeasons = (seasonIds: string[]) =>
  seasonIds.length ? run<Theme[]>(db().from("themes").select("*").in("apprenticeship_id", seasonIds).order("name")) : Promise.resolve([] as Theme[]);

export const createTheme = (values: Partial<Theme>) => run<Theme>(db().from("themes").insert(values).select().single());

export const updateTheme = (id: string, values: Partial<Theme>) =>
  run<Theme>(db().from("themes").update(values).eq("id", id).select().single());

export const deleteTheme = (id: string) => run(db().from("themes").delete().eq("id", id));

export const listEntryThemes = (seasonId: string) =>
  run<EntryTheme[]>(db().from("entry_themes").select("apprenticeship_id,entry_id,theme_id").eq("apprenticeship_id", seasonId));

export async function setEntryThemes(entryId: string, seasonId: string, themeIds: string[], current: string[]) {
  const add = themeIds.filter((id) => !current.includes(id));
  const remove = current.filter((id) => !themeIds.includes(id));
  if (add.length) await entryRemote.attachThemes(entryId, seasonId, add);
  if (remove.length) await run(db().from("entry_themes").delete().eq("entry_id", entryId).in("theme_id", remove));
}

export const listEntryLinks = () => run<EntryLink[]>(db().from("entry_links").select("*").order("created_at"));

export const createEntryLink = (values: Partial<EntryLink>) =>
  run<EntryLink>(db().from("entry_links").insert(values).select().single());

export const deleteEntryLink = (id: string) => run(db().from("entry_links").delete().eq("id", id));

export const listCarries = () => run<QuestionCarry[]>(db().from("question_carries").select("*").order("created_at"));

export const createCarry = (values: Partial<QuestionCarry>) =>
  run<QuestionCarry>(db().from("question_carries").insert(values).select().single());

export const deleteCarry = (id: string) => run(db().from("question_carries").delete().eq("id", id));

export const searchSeason = (seasonId: string, query: string) =>
  run<SearchResult[]>(db().rpc("search_apprenticeship", { p_apprenticeship_id: seasonId, p_query: query }));

// Inheritance and retrospective ----------------------------------------------

export const listInheritance = (seasonId: string) =>
  run<InheritanceEntry[]>(db().from("inheritance_entries").select("*").eq("apprenticeship_id", seasonId).order("noted_on", { ascending: false }));

export const createInheritance = (values: Partial<InheritanceEntry>) =>
  run<InheritanceEntry>(db().from("inheritance_entries").insert(values).select().single());

export const updateInheritance = (id: string, values: Partial<InheritanceEntry>) =>
  run<InheritanceEntry>(db().from("inheritance_entries").update(values).eq("id", id).select().single());

export const deleteInheritance = (id: string) => run(db().from("inheritance_entries").delete().eq("id", id));

export const listInheritanceLinks = () => run<InheritanceLink[]>(db().from("inheritance_links").select("*"));

export const createInheritanceLink = (values: Partial<InheritanceLink>) =>
  run<InheritanceLink>(db().from("inheritance_links").insert(values).select().single());

export const deleteInheritanceLink = (id: string) => run(db().from("inheritance_links").delete().eq("id", id));

export const getRetrospective = (seasonId: string) =>
  run<Retrospective | null>(db().from("retrospectives").select("*").eq("apprenticeship_id", seasonId).maybeSingle());

export const createRetrospective = (values: Partial<Retrospective> & { apprenticeship_id: string }) =>
  run<Retrospective>(db().from("retrospectives").insert(values).select().single());

/** Update only if nobody else saved in between; null means the stored copy moved on. */
export async function updateRetrospective(seasonId: string, revision: number, values: Partial<Retrospective>) {
  const rows = await run<Retrospective[]>(
    db().from("retrospectives").update(values).eq("apprenticeship_id", seasonId).eq("revision", revision).select(),
  );
  return rows[0] ?? null;
}

// External links ------------------------------------------------------------

export const listExternalLinks = () => run<ExternalLink[]>(db().from("external_links").select("*").order("created_at"));

export const createExternalLink = (values: Partial<ExternalLink>) =>
  run<ExternalLink>(db().from("external_links").insert(values).select().single());

export const deleteExternalLink = (id: string) => run(db().from("external_links").delete().eq("id", id));

export type { EntryWrite };
