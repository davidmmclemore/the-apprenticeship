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
  ExternalLink,
  InheritanceEntry,
  InheritanceLink,
  QuestionCarry,
  ReadingSession,
  Retrospective,
  RouteIntention,
  RouteSection,
  RouteStep,
  SeasonEvent,
  SeasonSnapshot,
  Theme,
  Work,
} from "./types";

/** Everything one season needs on screen, loaded together. */
export interface SeasonBundle {
  season: Apprenticeship;
  author: Author;
  authorFacts: AuthorFact[];
  /** All works by this author in the reader's bibliography (any season). */
  works: Work[];
  editions: Edition[];
  collectionMembers: CollectionMember[];
  seasonWorks: ApprenticeshipWork[];
  sections: RouteSection[];
  steps: RouteStep[];
  intentions: RouteIntention[];
  sessions: ReadingSession[];
  entries: Entry[];
  themes: Theme[];
  entryThemes: EntryTheme[];
  links: EntryLink[];
  carries: QuestionCarry[];
  inheritance: InheritanceEntry[];
  inheritanceLinks: InheritanceLink[];
  retrospective: Retrospective | null;
  externalLinks: ExternalLink[];
  events: SeasonEvent[];
  snapshots: SeasonSnapshot[];
  /** Other seasons with the same author, for consulting earlier work. */
  siblingSeasons: Apprenticeship[];
  loadedAt: string;
}
