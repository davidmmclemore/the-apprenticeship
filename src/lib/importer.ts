import { parseCsvObjects } from "./csv";
import type { Edition, EditionFormat, ScopeLevel, Work, WorkType } from "./types";

/**
 * Reviewed bibliography import. Parsing produces a preview; nothing is saved
 * until the reader confirms. Duplicates are detected against existing works
 * (normalised title) and editions (ISBN), and within the file itself. An
 * import never overwrites an existing record: a duplicate can be skipped,
 * added separately, or have only its new editions attached.
 */

export type ImportAction = "add" | "skip" | "add_editions" | "add_separately";

export interface ImportEdition {
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
}

export interface ImportWork {
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
  scope: ScopeLevel;
}

export interface ImportRow {
  index: number;
  work: ImportWork | null;
  editions: ImportEdition[];
  errors: string[];
  warnings: string[];
  /** Existing work this row appears to duplicate. */
  matchWorkId: string | null;
  matchReason: string | null;
  /** Earlier row in the same file with the same title. */
  duplicateOfRow: number | null;
  action: ImportAction;
}

const WORK_TYPES: WorkType[] = ["book", "essay", "letter", "poem", "collection", "short_story", "sermon", "lecture", "play", "article", "other"];
const TYPE_SYNONYMS: Record<string, WorkType> = {
  novel: "book",
  nonfiction: "book",
  "non-fiction": "book",
  memoir: "book",
  "short story": "short_story",
  story: "short_story",
  poetry: "poem",
  letters: "letter",
  anthology: "collection",
  omnibus: "collection",
  talk: "lecture",
  address: "lecture",
  homily: "sermon",
  drama: "play",
};
const FORMATS: EditionFormat[] = ["hardcover", "paperback", "print", "ebook", "audiobook", "online", "other"];
const FORMAT_SYNONYMS: Record<string, EditionFormat> = {
  hardback: "hardcover",
  "hard cover": "hardcover",
  softcover: "paperback",
  "paper back": "paperback",
  kindle: "ebook",
  "e-book": "ebook",
  epub: "ebook",
  audio: "audiobook",
  audible: "audiobook",
  web: "online",
};
const SCOPE_SYNONYMS: Record<string, ScopeLevel> = {
  essential: "essential",
  core: "essential",
  required: "essential",
  optional: "optional",
  maybe: "optional",
  outside: "outside",
  out: "outside",
  "outside current scope": "outside",
  excluded: "outside",
};

export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'"“”]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(the|a|an) /, "")
    .trim();
}

export function normaliseIsbn(isbn: string | null | undefined): string | null {
  if (!isbn) return null;
  const digits = isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
  return digits.length === 10 || digits.length === 13 ? digits : null;
}

type Raw = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function pick(raw: Raw, ...keys: string[]): unknown {
  for (const k of keys) if (raw[k] != null && raw[k] !== "") return raw[k];
  return undefined;
}

function parseYear(v: unknown, field: string, errors: string[]): { year: number | null; approximate: boolean; note: string | null } {
  const s = str(v);
  if (!s) return { year: null, approximate: false, note: null };
  const m = s.match(/^(c\.?|ca\.?|circa|~)?\s*(-?\d{1,4})\s*(bc|bce)?\??$/i);
  if (!m) {
    // Keep the reader's wording as a note rather than inventing a year.
    return { year: null, approximate: false, note: s };
  }
  let year = Number(m[2]);
  if (m[3]) year = -year;
  if (year < -3000 || year > 3000) {
    errors.push(`${field} “${s}” is out of range.`);
    return { year: null, approximate: false, note: null };
  }
  return { year, approximate: Boolean(m[1]) || s.endsWith("?"), note: null };
}

function parseUrl(v: unknown, field: string, errors: string[]): string | null {
  const s = str(v);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    errors.push(`${field} must start with http:// or https://.`);
    return null;
  }
  return s;
}

function parseBool(v: unknown): boolean | null {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (["true", "yes", "y", "1", "abridged"].includes(s)) return true;
  if (["false", "no", "n", "0", "unabridged", "complete"].includes(s)) return false;
  return null;
}

function parseEdition(raw: Raw, errors: string[], warnings: string[]): ImportEdition | null {
  const edition: ImportEdition = {
    edition_title: str(pick(raw, "edition_title")),
    publisher: str(pick(raw, "publisher")),
    publication_year: null,
    isbn: null,
    translator: str(pick(raw, "translator")),
    editor: str(pick(raw, "editor")),
    format: null,
    page_count: null,
    abridged: parseBool(pick(raw, "abridged")),
    external_url: parseUrl(pick(raw, "external_url", "edition_url", "url"), "Edition link", errors),
  };
  const pubYear = str(pick(raw, "publication_year", "edition_year"));
  if (pubYear) {
    const n = Number(pubYear);
    if (Number.isInteger(n) && n >= 1000 && n <= 3000) edition.publication_year = n;
    else errors.push(`Edition year “${pubYear}” should be a four-digit year.`);
  }
  const isbn = str(pick(raw, "isbn", "isbn13", "isbn_13", "isbn10"));
  if (isbn) {
    const n = normaliseIsbn(isbn);
    if (n) edition.isbn = n;
    else errors.push(`ISBN “${isbn}” isn’t a valid 10- or 13-digit ISBN.`);
  }
  const format = str(pick(raw, "format"))?.toLowerCase();
  if (format) {
    const f = (FORMATS as string[]).includes(format) ? (format as EditionFormat) : FORMAT_SYNONYMS[format];
    if (f) edition.format = f;
    else warnings.push(`Unknown format “${format}”; left blank.`);
  }
  const pages = str(pick(raw, "page_count", "pages"));
  if (pages) {
    const n = Number(pages);
    if (Number.isInteger(n) && n > 0) edition.page_count = n;
    else warnings.push(`Page count “${pages}” ignored.`);
  }
  const hasContent = Object.values(edition).some((v) => v != null);
  return hasContent ? edition : null;
}

function parseWork(raw: Raw, errors: string[], warnings: string[], defaultScope: ScopeLevel): ImportWork | null {
  const title = str(pick(raw, "title", "work", "work_title"));
  if (!title) {
    errors.push("A title is required.");
    return null;
  }
  if (title.length > 500) errors.push("Title is longer than 500 characters.");
  const typeRaw = str(pick(raw, "work_type", "type"))?.toLowerCase();
  let work_type: WorkType = "book";
  if (typeRaw) {
    const t = (WORK_TYPES as string[]).includes(typeRaw) ? (typeRaw as WorkType) : TYPE_SYNONYMS[typeRaw];
    if (t) work_type = t;
    else {
      warnings.push(`Unknown type “${typeRaw}”; recorded as “other”.`);
      work_type = "other";
    }
  }
  const year = parseYear(pick(raw, "original_year", "year", "first_published"), "Original year", errors);
  if (year.note) warnings.push(`Original date “${year.note}” kept as a note; year left unknown.`);
  const scopeRaw = str(pick(raw, "scope"))?.toLowerCase();
  let scope = defaultScope;
  if (scopeRaw) {
    const s = SCOPE_SYNONYMS[scopeRaw];
    if (s) scope = s;
    else warnings.push(`Unknown scope “${scopeRaw}”; using ${defaultScope}.`);
  }
  const approx = parseBool(pick(raw, "original_year_approximate", "year_approximate", "approximate"));
  return {
    title,
    work_type,
    genre: str(pick(raw, "genre")),
    original_year: year.year,
    original_year_approximate: approx ?? year.approximate,
    year_note: str(pick(raw, "year_note")) ?? year.note,
    description: str(pick(raw, "description")),
    cover_url: parseUrl(pick(raw, "cover_url", "cover"), "Cover link", errors),
    sources: str(pick(raw, "sources", "source")),
    verification_note: str(pick(raw, "verification_note", "notes")),
    scope,
  };
}

export function readImportFile(text: string, fileName: string): Raw[] {
  const trimmed = text.trim();
  if (fileName.toLowerCase().endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.works) ? parsed.works : null;
    if (!list) throw new Error("JSON must be an array of works, or an object with a “works” array.");
    return list as Raw[];
  }
  return parseCsvObjects(text);
}

export interface ExistingCatalog {
  works: Pick<Work, "id" | "title">[];
  editions: Pick<Edition, "work_id" | "isbn">[];
}

export function buildImportPreview(rawRows: Raw[], existing: ExistingCatalog, defaultScope: ScopeLevel = "essential"): ImportRow[] {
  const byTitle = new Map(existing.works.map((w) => [normaliseTitle(w.title), w.id]));
  const byIsbn = new Map<string, string>();
  for (const e of existing.editions) {
    const n = normaliseIsbn(e.isbn);
    if (n) byIsbn.set(n, e.work_id);
  }

  // CSV rows with the same title describe editions of one work: group them.
  const grouped: { raw: Raw; extraEditions: Raw[] }[] = [];
  const firstByTitle = new Map<string, number>();
  for (const raw of rawRows) {
    const title = str(pick(raw, "title", "work", "work_title"));
    const key = title ? normaliseTitle(title) : null;
    const isCsvEditionRow = key && firstByTitle.has(key) && !Array.isArray(raw.editions);
    if (isCsvEditionRow) grouped[firstByTitle.get(key!)!].extraEditions.push(raw);
    else {
      if (key) firstByTitle.set(key, grouped.length);
      grouped.push({ raw, extraEditions: [] });
    }
  }

  const seenInFile = new Map<string, number>();
  return grouped.map(({ raw, extraEditions }, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const work = parseWork(raw, errors, warnings, defaultScope);
    const editions: ImportEdition[] = [];
    const editionSources: Raw[] = Array.isArray(raw.editions) ? (raw.editions as Raw[]) : [raw, ...extraEditions];
    for (const src of editionSources) {
      const e = parseEdition(src, errors, warnings);
      if (e) editions.push(e);
    }

    let matchWorkId: string | null = null;
    let matchReason: string | null = null;
    let duplicateOfRow: number | null = null;
    if (work) {
      const key = normaliseTitle(work.title);
      if (byTitle.has(key)) {
        matchWorkId = byTitle.get(key)!;
        matchReason = "Same title as a work already in your bibliography";
      }
      for (const e of editions) {
        const isbnMatch = e.isbn ? byIsbn.get(e.isbn) : undefined;
        if (isbnMatch) {
          matchWorkId = matchWorkId ?? isbnMatch;
          matchReason = `ISBN ${e.isbn} is already recorded`;
        }
      }
      if (seenInFile.has(key)) duplicateOfRow = seenInFile.get(key)!;
      else seenInFile.set(key, index);
    }

    // Editions whose ISBN already exists are never re-added.
    const freshEditions = editions.filter((e) => !(e.isbn && byIsbn.has(e.isbn)));
    if (freshEditions.length < editions.length) warnings.push("Editions with an ISBN you already have will be skipped.");

    let action: ImportAction = "add";
    if (errors.length || !work || duplicateOfRow != null) action = "skip";
    else if (matchWorkId) action = "skip";

    return {
      index,
      work,
      editions: freshEditions,
      errors,
      warnings,
      matchWorkId,
      matchReason,
      duplicateOfRow,
      action,
    };
  });
}

export const IMPORT_TEMPLATE_CSV =
  "title,type,original_year,year_note,genre,scope,description,sources,edition_title,publisher,publication_year,isbn,translator,editor,format,page_count,abridged,external_url\n" +
  '"Example Work",book,1950,,,essential,"A short note","Where the date came from",,"Example Press",2001,,,,paperback,240,no,\n';
