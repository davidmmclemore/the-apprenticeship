import type {
  EditionFormat,
  EntryKind,
  ExternalApp,
  InheritanceCategory,
  LinkRelation,
  PositionKind,
  Provenance,
  QuestionStatus,
  ScopeLevel,
  SeasonStatus,
  SessionStatus,
  WorkType,
} from "./types";

export const SEASON_STATUS: Record<SeasonStatus, string> = {
  planned: "Planned",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

export const WORK_TYPES: Record<WorkType, string> = {
  book: "Book",
  essay: "Essay",
  letter: "Letter",
  poem: "Poem",
  collection: "Collection",
  short_story: "Short story",
  sermon: "Sermon",
  lecture: "Lecture",
  play: "Play",
  article: "Article",
  other: "Other",
};

export const EDITION_FORMATS: Record<EditionFormat, string> = {
  hardcover: "Hardcover",
  paperback: "Paperback",
  print: "Print",
  ebook: "Ebook",
  audiobook: "Audiobook",
  online: "Online",
  other: "Other",
};

export const SCOPES: Record<ScopeLevel, { label: string; hint: string }> = {
  essential: { label: "Essential", hint: "Central to this season" },
  optional: { label: "Optional", hint: "If the season allows" },
  outside: { label: "Outside current scope", hint: "Known, but not for now" },
};

export const SESSION_STATUS: Record<SessionStatus, string> = {
  not_started: "Not started",
  reading: "Reading",
  paused: "Paused",
  finished: "Finished",
  set_aside: "Set aside",
};

export const POSITION_KINDS: Record<PositionKind, { label: string; placeholder: string; prefix: string }> = {
  page: { label: "Page", placeholder: "e.g. 112", prefix: "p. " },
  chapter: { label: "Chapter", placeholder: "e.g. 7 or “The Weight of Glory”", prefix: "ch. " },
  section: { label: "Section", placeholder: "e.g. Book II, Part 3", prefix: "" },
  ebook_location: { label: "Ebook location", placeholder: "e.g. 1450 or 34%", prefix: "loc. " },
  audiobook_timestamp: { label: "Audiobook time", placeholder: "e.g. 3:42:10", prefix: "" },
  free_text: { label: "Other", placeholder: "Anything that helps you find your place", prefix: "" },
};

export const ENTRY_KINDS: Record<EntryKind, { label: string; plural: string; hint: string }> = {
  reflection: { label: "Reflection", plural: "Reflections", hint: "My own thinking" },
  quotation: { label: "Quotation", plural: "Quotations", hint: "The author’s words" },
  question: { label: "Question", plural: "Questions", hint: "Something I’m asking" },
  observation: { label: "Observation", plural: "Observations", hint: "Something I noticed" },
};

export const PROVENANCE: Record<Provenance, string> = {
  mine: "My words",
  imported: "Imported",
  ai_suggested: "AI-suggested",
};

export const QUESTION_STATUS: Record<QuestionStatus, { label: string; hint: string }> = {
  open: { label: "Open", hint: "Still asking" },
  developing: { label: "Developing", hint: "Understanding is growing" },
  resolved: { label: "Resolved", hint: "Found a resting place" },
};

export const LINK_RELATIONS: Record<LinkRelation, { label: string; phrase: string }> = {
  extends: { label: "Extends", phrase: "extends" },
  complicates: { label: "Complicates", phrase: "complicates" },
  contradicts: { label: "Contradicts", phrase: "contradicts" },
  related: { label: "Related", phrase: "relates to" },
  unsure: { label: "Unsure", phrase: "may connect with" },
};

export const INHERITANCE_CATEGORIES: Record<InheritanceCategory, string> = {
  life: "Life",
  ministry: "Ministry",
  reading: "Reading",
  writing: "Writing",
  other: "Other",
};

export const EXTERNAL_APPS: Record<ExternalApp, string> = {
  personal_library: "Personal Library",
  the_study: "The Study",
  other: "Other link",
};

export const FINISH_PROMPTS = [
  "What does this reveal about the author?",
  "How does it connect with what I’ve already read?",
  "What will stay with me?",
] as const;
