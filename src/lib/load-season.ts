import type { SeasonBundle } from "./bundle";
import * as data from "./data";

export class NotFoundError extends Error {}

/** Load everything one season shows, in parallel. Ownership is enforced by RLS. */
export async function loadSeasonBundle(id: string): Promise<SeasonBundle> {
  const season = await data.getSeason(id);
  if (!season) throw new NotFoundError("This season couldn’t be found. It may have been deleted, or it belongs to another account.");

  const [
    author,
    authorFacts,
    works,
    collectionMembers,
    seasonWorks,
    sections,
    steps,
    intentions,
    sessions,
    entries,
    themes,
    entryThemes,
    links,
    carries,
    inheritance,
    inheritanceLinks,
    retrospective,
    externalLinks,
    events,
    snapshots,
    allSeasons,
  ] = await Promise.all([
    data.getAuthor(season.author_id),
    data.listAuthorFacts(season.author_id),
    data.listWorksByAuthor(season.author_id),
    data.listCollectionMembers(),
    data.listSeasonWorks(id),
    data.listSections(id),
    data.listSteps(id),
    data.listIntentions(id),
    data.listSessions(id),
    data.listEntries(id),
    data.listThemes(id),
    data.listEntryThemes(id),
    data.listEntryLinks(),
    data.listCarries(),
    data.listInheritance(id),
    data.listInheritanceLinks(),
    data.getRetrospective(id),
    data.listExternalLinks(),
    data.listSeasonEvents(id),
    data.listSnapshots(id),
    data.listSeasons(),
  ]);
  if (!author) throw new NotFoundError("This season’s author record is missing.");

  const editions = await data.listEditions(works.map((w) => w.id));
  const workIds = new Set(works.map((w) => w.id));
  const editionIds = new Set(editions.map((e) => e.id));
  const entryIds = new Set(entries.map((e) => e.id));
  const inheritanceIds = new Set(inheritance.map((i) => i.id));

  return {
    season,
    author,
    authorFacts,
    works,
    editions,
    collectionMembers: collectionMembers.filter((c) => workIds.has(c.collection_work_id) || workIds.has(c.member_work_id)),
    seasonWorks,
    sections,
    steps,
    intentions,
    sessions,
    entries,
    themes,
    entryThemes,
    // Links may reach entries in earlier seasons; keep any that touch this one.
    links: links.filter((l) => entryIds.has(l.from_entry_id) || entryIds.has(l.to_entry_id)),
    carries: carries.filter((c) => c.apprenticeship_id === id || entryIds.has(c.question_entry_id)),
    inheritance,
    inheritanceLinks: inheritanceLinks.filter((l) => inheritanceIds.has(l.inheritance_id)),
    retrospective,
    externalLinks: externalLinks.filter(
      (l) =>
        l.apprenticeship_id === id ||
        l.author_id === season.author_id ||
        (l.work_id != null && workIds.has(l.work_id)) ||
        (l.edition_id != null && editionIds.has(l.edition_id)),
    ),
    events,
    snapshots,
    siblingSeasons: allSeasons.filter((s) => s.author_id === season.author_id && s.id !== id),
    loadedAt: new Date().toISOString(),
  };
}
