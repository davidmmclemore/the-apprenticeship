"use client";

import { useEffect, useId, useRef, useState } from "react";
import { addWorkToSeason, createEdition, createWork, updateEdition, updateWork } from "@/lib/data";
import { normaliseIsbn, normaliseTitle } from "@/lib/importer";
import { EDITION_FORMATS, SCOPES, WORK_TYPES } from "@/lib/labels";
import { describeError } from "@/lib/supabase";
import type { Edition, EditionFormat, ScopeLevel, Work, WorkType } from "@/lib/types";
import { Field, Sheet, useToast } from "../ui";
import { useSeason } from "./context";

interface WorkFormValues {
  title: string;
  work_type: WorkType;
  genre: string;
  original_year: string;
  original_year_approximate: boolean;
  year_note: string;
  description: string;
  cover_url: string;
  sources: string;
  verification_note: string;
}

const blankWork: WorkFormValues = {
  title: "",
  work_type: "book",
  genre: "",
  original_year: "",
  original_year_approximate: false,
  year_note: "",
  description: "",
  cover_url: "",
  sources: "",
  verification_note: "",
};

function fromWork(w: Work): WorkFormValues {
  return {
    title: w.title,
    work_type: w.work_type,
    genre: w.genre ?? "",
    original_year: w.original_year?.toString() ?? "",
    original_year_approximate: w.original_year_approximate,
    year_note: w.year_note ?? "",
    description: w.description ?? "",
    cover_url: w.cover_url ?? "",
    sources: w.sources ?? "",
    verification_note: w.verification_note ?? "",
  };
}

function validateWork(v: WorkFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) errors.title = "A title is needed.";
  if (v.original_year.trim()) {
    const n = Number(v.original_year);
    if (!Number.isInteger(n) || n < -3000 || n > 3000) errors.original_year = "Use a year such as 1942 (negative for BC), or leave it blank if unknown.";
  }
  if (v.cover_url.trim() && !/^https?:\/\//i.test(v.cover_url.trim())) errors.cover_url = "Use a full link starting with https://";
  return errors;
}

function toWorkRow(v: WorkFormValues): Partial<Work> {
  const blank = (s: string) => (s.trim() ? s.trim() : null);
  return {
    title: v.title.trim(),
    work_type: v.work_type,
    genre: blank(v.genre),
    original_year: v.original_year.trim() ? Number(v.original_year) : null,
    original_year_approximate: v.original_year.trim() ? v.original_year_approximate : false,
    year_note: blank(v.year_note),
    description: blank(v.description),
    cover_url: blank(v.cover_url),
    sources: blank(v.sources),
    verification_note: blank(v.verification_note),
  };
}

export function WorkFormSheet({ open, onClose, work }: { open: boolean; onClose: () => void; work?: Work | null }) {
  const { b, reload } = useSeason();
  const toast = useToast();
  const [v, setV] = useState<WorkFormValues>(blankWork);
  const [scope, setScope] = useState<ScopeLevel>("essential");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);
  const id = (k: string) => `work-${k}`;
  const editing = Boolean(work);

  useEffect(() => {
    if (open) {
      setV(work ? fromWork(work) : blankWork);
      setErrors({});
      setAdded([]);
    }
  }, [open, work]);

  const duplicate =
    !editing && v.title.trim() ? b.works.find((w) => normaliseTitle(w.title) === normaliseTitle(v.title)) : undefined;

  const set = <K extends keyof WorkFormValues>(key: K, value: WorkFormValues[K]) => setV((cur) => ({ ...cur, [key]: value }));

  async function save(another: boolean) {
    const errs = validateWork(v);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (work) {
        await updateWork(work.id, toWorkRow(v));
        toast("Work updated.");
        await reload();
        onClose();
      } else {
        const created = await createWork({ ...toWorkRow(v), author_id: b.author.id });
        await addWorkToSeason({ apprenticeship_id: b.season.id, work_id: created.id, scope });
        await reload();
        if (another) {
          setAdded((cur) => [...cur, created.title]);
          setV({ ...blankWork, work_type: v.work_type });
          setErrors({});
          titleRef.current?.focus();
        } else {
          toast(`Added “${created.title}”.`);
          onClose();
        }
      }
    } catch (e) {
      setErrors({ form: describeError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Edit work" : "Add a work"} description={editing ? undefined : `By ${b.author.name}. Only the title is required.`} wide>
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        {added.length > 0 && (
          <p className="notice small" role="status" style={{ margin: 0 }}>
            Added {added.map((t) => `“${t}”`).join(", ")}.
          </p>
        )}
        <div className="grid-2">
          <Field label="Title" htmlFor={id("title")} error={errors.title}>
            <input
              ref={titleRef}
              id={id("title")}
              className="input"
              value={v.title}
              onChange={(e) => set("title", e.target.value)}
              aria-invalid={Boolean(errors.title)}
              autoFocus
              autoComplete="off"
            />
          </Field>
          <Field label="Type" htmlFor={id("type")}>
            <select id={id("type")} className="select" value={v.work_type} onChange={(e) => set("work_type", e.target.value as WorkType)}>
              {(Object.keys(WORK_TYPES) as WorkType[]).map((t) => (
                <option key={t} value={t}>
                  {WORK_TYPES[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {duplicate && (
          <p className="notice notice-warm small" style={{ margin: 0 }}>
            You already have “{duplicate.title}” for {b.author.name}. Saving will add a separate work; if this is another edition, add an edition to the
            existing work instead.
          </p>
        )}
        <div className="grid-2">
          <Field
            label="Original publication year"
            htmlFor={id("year")}
            error={errors.original_year}
            hint="When the work first appeared — not the date of your edition. Leave blank if unknown."
          >
            <input
              id={id("year")}
              className="input"
              inputMode="numeric"
              value={v.original_year}
              onChange={(e) => set("original_year", e.target.value)}
              aria-invalid={Boolean(errors.original_year)}
              placeholder="Unknown"
            />
          </Field>
          <Field label="Genre (optional)" htmlFor={id("genre")}>
            <input id={id("genre")} className="input" value={v.genre} onChange={(e) => set("genre", e.target.value)} />
          </Field>
        </div>
        {v.original_year.trim() && (
          <label className="checkbox">
            <input type="checkbox" checked={v.original_year_approximate} onChange={(e) => set("original_year_approximate", e.target.checked)} />
            <span>This year is approximate</span>
          </label>
        )}
        <Field label="Date note (optional)" htmlFor={id("yearnote")} hint="e.g. “written 1938, published posthumously” or “date disputed”.">
          <input id={id("yearnote")} className="input" value={v.year_note} onChange={(e) => set("year_note", e.target.value)} />
        </Field>

        {!editing && (
          <Field label="In this season" htmlFor={id("scope")}>
            <select id={id("scope")} className="select" value={scope} onChange={(e) => setScope(e.target.value as ScopeLevel)}>
              {(Object.keys(SCOPES) as ScopeLevel[]).map((s) => (
                <option key={s} value={s}>
                  {SCOPES[s].label} — {SCOPES[s].hint}
                </option>
              ))}
            </select>
          </Field>
        )}

        <details className="disclosure" open={editing && Boolean(v.description || v.cover_url || v.sources || v.verification_note)}>
          <summary className="small muted">Description, cover and sources</summary>
          <div className="stack" style={{ marginTop: "0.75rem" }}>
            <Field label="Description (optional)" htmlFor={id("desc")}>
              <textarea id={id("desc")} className="textarea" rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <Field label="Cover image link (optional)" htmlFor={id("cover")} error={errors.cover_url} hint="A link to an image you’d like to see on your shelf.">
              <input id={id("cover")} className="input" type="url" inputMode="url" value={v.cover_url} onChange={(e) => set("cover_url", e.target.value)} />
            </Field>
            <Field label="Sources (optional)" htmlFor={id("sources")} hint="Where these details came from.">
              <textarea id={id("sources")} className="textarea" rows={2} value={v.sources} onChange={(e) => set("sources", e.target.value)} />
            </Field>
            <Field label="Uncertainty or verification notes (optional)" htmlFor={id("verify")}>
              <textarea id={id("verify")} className="textarea" rows={2} value={v.verification_note} onChange={(e) => set("verification_note", e.target.value)} />
            </Field>
          </div>
        </details>

        {errors.form && (
          <p className="notice notice-error" role="alert" style={{ margin: 0 }}>
            {errors.form}
          </p>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {added.length ? "Done" : "Cancel"}
          </button>
          {!editing && (
            <button type="button" className="btn" disabled={busy} onClick={() => void save(true)}>
              Save and add another
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

interface EditionValues {
  edition_title: string;
  publisher: string;
  publication_year: string;
  isbn: string;
  translator: string;
  editor: string;
  format: EditionFormat | "";
  page_count: string;
  abridged: "" | "yes" | "no";
  external_url: string;
  notes: string;
}

const blankEdition: EditionValues = {
  edition_title: "",
  publisher: "",
  publication_year: "",
  isbn: "",
  translator: "",
  editor: "",
  format: "",
  page_count: "",
  abridged: "",
  external_url: "",
  notes: "",
};

export function EditionFormSheet({ open, onClose, work, edition }: { open: boolean; onClose: () => void; work: Work; edition?: Edition | null }) {
  const { b, act } = useSeason();
  const [v, setV] = useState<EditionValues>(blankEdition);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setV(
      edition
        ? {
            edition_title: edition.edition_title ?? "",
            publisher: edition.publisher ?? "",
            publication_year: edition.publication_year?.toString() ?? "",
            isbn: edition.isbn ?? "",
            translator: edition.translator ?? "",
            editor: edition.editor ?? "",
            format: edition.format ?? "",
            page_count: edition.page_count?.toString() ?? "",
            abridged: edition.abridged == null ? "" : edition.abridged ? "yes" : "no",
            external_url: edition.external_url ?? "",
            notes: edition.notes ?? "",
          }
        : blankEdition,
    );
  }, [open, edition]);

  const set = <K extends keyof EditionValues>(key: K, value: EditionValues[K]) => setV((cur) => ({ ...cur, [key]: value }));

  async function save() {
    const errs: Record<string, string> = {};
    const year = v.publication_year.trim();
    if (year && (!/^\d{4}$/.test(year) || Number(year) < 1000)) errs.publication_year = "Use a four-digit year.";
    const isbn = v.isbn.trim() ? normaliseIsbn(v.isbn) : null;
    if (v.isbn.trim() && !isbn) errs.isbn = "That doesn’t look like a 10- or 13-digit ISBN.";
    if (isbn && b.editions.some((e) => e.id !== edition?.id && normaliseIsbn(e.isbn) === isbn)) errs.isbn = "You’ve already recorded an edition with this ISBN.";
    const pages = v.page_count.trim();
    if (pages && (!/^\d+$/.test(pages) || Number(pages) < 1)) errs.page_count = "Use a whole number.";
    if (v.external_url.trim() && !/^https?:\/\//i.test(v.external_url.trim())) errs.external_url = "Use a full link starting with https://";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const blank = (s: string) => (s.trim() ? s.trim() : null);
    const row: Partial<Edition> = {
      edition_title: blank(v.edition_title),
      publisher: blank(v.publisher),
      publication_year: year ? Number(year) : null,
      isbn,
      translator: blank(v.translator),
      editor: blank(v.editor),
      format: v.format || null,
      page_count: pages ? Number(pages) : null,
      abridged: v.abridged === "" ? null : v.abridged === "yes",
      external_url: blank(v.external_url),
      notes: blank(v.notes),
    };
    const ok = await act(() => (edition ? updateEdition(edition.id, row) : createEdition({ ...row, work_id: work.id })), edition ? "Edition updated." : "Edition added.");
    if (ok) onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={edition ? "Edit edition" : "Add an edition"} description={<em>{work.title}</em>} wide>
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="small muted" style={{ margin: 0 }}>
          A particular publication, translation, abridgment or format. Every field is optional. An edition’s year never replaces the work’s original
          date.
        </p>
        <div className="grid-2">
          <Field label="Edition title, if different" htmlFor={id("t")}>
            <input id={id("t")} className="input" value={v.edition_title} onChange={(e) => set("edition_title", e.target.value)} />
          </Field>
          <Field label="Format" htmlFor={id("f")}>
            <select id={id("f")} className="select" value={v.format} onChange={(e) => set("format", e.target.value as EditionFormat | "")}>
              <option value="">Not specified</option>
              {(Object.keys(EDITION_FORMATS) as EditionFormat[]).map((f) => (
                <option key={f} value={f}>
                  {EDITION_FORMATS[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Publisher" htmlFor={id("p")}>
            <input id={id("p")} className="input" value={v.publisher} onChange={(e) => set("publisher", e.target.value)} />
          </Field>
          <Field label="Edition year" htmlFor={id("y")} error={errors.publication_year}>
            <input id={id("y")} className="input" inputMode="numeric" value={v.publication_year} onChange={(e) => set("publication_year", e.target.value)} />
          </Field>
          <Field label="ISBN" htmlFor={id("i")} error={errors.isbn}>
            <input id={id("i")} className="input" inputMode="numeric" value={v.isbn} onChange={(e) => set("isbn", e.target.value)} />
          </Field>
          <Field label="Pages" htmlFor={id("pc")} error={errors.page_count}>
            <input id={id("pc")} className="input" inputMode="numeric" value={v.page_count} onChange={(e) => set("page_count", e.target.value)} />
          </Field>
          <Field label="Translator" htmlFor={id("tr")}>
            <input id={id("tr")} className="input" value={v.translator} onChange={(e) => set("translator", e.target.value)} />
          </Field>
          <Field label="Editor" htmlFor={id("ed")}>
            <input id={id("ed")} className="input" value={v.editor} onChange={(e) => set("editor", e.target.value)} />
          </Field>
          <Field label="Abridged?" htmlFor={id("ab")}>
            <select id={id("ab")} className="select" value={v.abridged} onChange={(e) => set("abridged", e.target.value as EditionValues["abridged"])}>
              <option value="">Unknown</option>
              <option value="no">Complete</option>
              <option value="yes">Abridged</option>
            </select>
          </Field>
          <Field label="Link (optional)" htmlFor={id("u")} error={errors.external_url} hint="An ebook, audiobook or online text you use.">
            <input id={id("u")} className="input" type="url" value={v.external_url} onChange={(e) => set("external_url", e.target.value)} />
          </Field>
        </div>
        <Field label="Notes" htmlFor={id("n")}>
          <textarea id={id("n")} className="textarea" rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save edition
          </button>
        </div>
      </form>
    </Sheet>
  );
}
