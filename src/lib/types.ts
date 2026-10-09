// Row types for the `apprenticeship` schema. Kept by hand alongside
// supabase/migrations; names mirror the columns exactly.

export type SeasonStatus = "planned" | "active" | "paused" | "completed" | "archived";
export type WorkType =
  | "book"
  | "essay"
  | "letter"
  | "poem"
  | "collection"
  | "short_story"
  | "sermon"
  | "lecture"
  | "play"
  | "article"
  | "other";
export type EditionFormat = "hardcover" | "paperback" | "print" | "ebook" | "audiobook" | "online" | "other";
export type ScopeLevel = "essential" | "optional" | "outside";
export type RouteOrigin = "mine" | "publication_order" | "imported";
export type SessionStatus = "not_started" | "reading" | "paused" | "finished" | "set_aside";
export type PositionKind = "page" | "chapter" | "section" | "ebook_location" | "audiobook_timestamp" | "free_text";
export type EntryKind = "quotation" | "reflection" | "question" | "observation";
export type Provenance = "mine" | "imported" | "ai_suggested";
export type QuestionStatus = "open" | "developing" | "resolved";
export type LinkRelation = "extends" | "complicates" | "contradicts" | "related" | "unsure";
export type InheritanceCategory = "life" | "ministry" | "reading" | "writing" | "other";
export type FactKind = "biography" | "event";
export type Verification = "unverified" | "verified" | "uncertain";
export type ExternalApp = "personal_library" | "the_study" | "other";

export interface Author {
  id: string;
  owner_id: string;
  name: string;
  sort_name: string | null;
  portrait_url: string | null;
  life_dates: string | null;
  intro_notes_html: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthorFact {
  id: string;
  author_id: string;
  kind: FactKind;
  year: number | null;
  date_text: string | null;
  body: string;
  source_citation: string | null;
  source_url: string | null;
  verification: Verification;
  created_at: string;
  updated_at: string;
}

export interface Work {
  id: string;
  owner_id: string;
  author_id: string;
  title: string;
  work_type: WorkType;
  genre: string | null;
  original_year: number | null;
  original_year_approximate: boolean;
  year_note: string | null;
  description: string | null;
  cover_url: string | null;
  sources: string | null;
  verification_note: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Edition {
  id: string;
  work_id: string;
  edition_title: string | null;
  publisher: string | null;
  publication_year: number | null;
  isbn: string | null;
  translator: string | null;
  editor: string | null;
  format: EditionFormat | null;
  page_count: number | null;
  abridged: boolean | null;
  external_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionMember {
  collection_work_id: string;
  member_work_id: string;
  position: number;
  note: string | null;
}

export interface Apprenticeship {
  id: string;
  owner_id: string;
  author_id: string;
  title: string;
  purpose: string | null;
  start_date: string | null;
  target_end_date: string | null;
  status: SeasonStatus;
  archived_from_status: SeasonStatus | null;
  completed_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeasonEvent {
  id: string;
  apprenticeship_id: string;
  from_status: SeasonStatus | null;
  to_status: SeasonStatus | null;
  start_date: string | null;
  target_end_date: string | null;
  occurred_at: string;
}

export interface SeasonSnapshot {
  id: string;
  apprenticeship_id: string;
  reason: "completed" | "manual";
  note: string | null;
  data: SnapshotData;
  taken_at: string;
}

export interface SnapshotData {
  apprenticeship: {
    title: string;
    purpose: string | null;
    status: SeasonStatus;
    start_date: string | null;
    target_end_date: string | null;
    completed_on: string | null;
    author: string;
  };
  scope: {
    work_id: string;
    title: string;
    work_type: WorkType;
    original_year: number | null;
    scope: ScopeLevel;
    favorite: boolean;
    favorite_note: string | null;
  }[];
  sections: { id: string; title: string; description: string | null; position: number }[];
  route: {
    work_id: string;
    title: string;
    section_id: string | null;
    position: number;
    rationale: string | null;
    target_month: string | null;
    origin: RouteOrigin;
  }[];
  sessions: {
    id: string;
    work_id: string;
    title: string;
    status: SessionStatus;
    ordinal: number;
    started_on: string | null;
    finished_on: string | null;
  }[];
}

export interface ApprenticeshipWork {
  apprenticeship_id: string;
  work_id: string;
  scope: ScopeLevel;
  selection_note: string | null;
  favorite: boolean;
  favorite_note: string | null;
  keep_for_guide: boolean;
  created_at: string;
  updated_at: string;
}

export interface RouteSection {
  id: string;
  apprenticeship_id: string;
  title: string;
  description: string | null;
  position: number;
}

export interface RouteStep {
  id: string;
  apprenticeship_id: string;
  work_id: string;
  section_id: string | null;
  position: number;
  rationale: string | null;
  target_month: string | null;
  origin: RouteOrigin;
  created_at: string;
}

export interface RouteIntention {
  id: string;
  apprenticeship_id: string;
  month: string;
  intention: string;
}

export interface ReadingSession {
  id: string;
  apprenticeship_id: string;
  work_id: string;
  edition_id: string | null;
  status: SessionStatus;
  is_primary: boolean;
  ordinal: number;
  started_on: string | null;
  finished_on: string | null;
  position_kind: PositionKind | null;
  position_value: string | null;
  position_updated_at: string | null;
  reflection: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: string;
  owner_id: string;
  apprenticeship_id: string;
  work_id: string | null;
  session_id: string | null;
  edition_id: string | null;
  kind: EntryKind;
  title: string | null;
  body_html: string | null;
  quote_text: string | null;
  quote_locator: string | null;
  quote_source: string | null;
  provenance: Provenance;
  provenance_note: string | null;
  question_status: QuestionStatus | null;
  prompt: string | null;
  keep_for_guide: boolean;
  favorite: boolean;
  revision: number;
  captured_at: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Columns a client may write on an entry. */
export type EntryWrite = Pick<
  Entry,
  | "apprenticeship_id"
  | "work_id"
  | "session_id"
  | "edition_id"
  | "kind"
  | "title"
  | "body_html"
  | "quote_text"
  | "quote_locator"
  | "quote_source"
  | "provenance"
  | "provenance_note"
  | "question_status"
  | "prompt"
  | "keep_for_guide"
  | "favorite"
  | "captured_at"
  | "archived_at"
>;

export interface EntryVersion {
  id: string;
  entry_id: string;
  revision: number;
  title: string | null;
  body_html: string | null;
  quote_text: string | null;
  quote_locator: string | null;
  quote_source: string | null;
  question_status: QuestionStatus | null;
  recorded_at: string;
}

export interface Theme {
  id: string;
  apprenticeship_id: string;
  name: string;
  description_html: string | null;
  synthesis_html: string | null;
  continues_theme_id: string | null;
  keep_for_guide: boolean;
  revision: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryTheme {
  apprenticeship_id: string;
  entry_id: string;
  theme_id: string;
}

export interface EntryLink {
  id: string;
  from_entry_id: string;
  to_entry_id: string;
  relation: LinkRelation;
  note: string | null;
  created_at: string;
}

export interface QuestionCarry {
  id: string;
  question_entry_id: string;
  apprenticeship_id: string;
  work_id: string | null;
  note: string | null;
  created_at: string;
}

export interface InheritanceEntry {
  id: string;
  apprenticeship_id: string;
  title: string;
  takeaway_html: string | null;
  category: InheritanceCategory;
  practical_intention: string | null;
  noted_on: string;
  favorite: boolean;
  keep_for_guide: boolean;
  revision: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InheritanceLink {
  id: string;
  inheritance_id: string;
  work_id: string | null;
  entry_id: string | null;
}

export interface Retrospective {
  apprenticeship_id: string;
  why_began_html: string | null;
  works_read_html: string | null;
  favorites_html: string | null;
  quotations_html: string | null;
  themes_html: string | null;
  questions_html: string | null;
  recommended_order_html: string | null;
  carrying_forward_html: string | null;
  concluding_essay_html: string | null;
  revision: number;
  updated_at: string;
}

export interface ExternalLink {
  id: string;
  apprenticeship_id: string | null;
  author_id: string | null;
  work_id: string | null;
  edition_id: string | null;
  app: ExternalApp;
  label: string;
  url: string;
  created_at: string;
}

export interface SearchResult {
  result_type: "entry" | "theme" | "work" | "inheritance";
  id: string;
  title: string | null;
  snippet: string | null;
  work_id: string | null;
  entry_kind: EntryKind | null;
  rank: number;
}
