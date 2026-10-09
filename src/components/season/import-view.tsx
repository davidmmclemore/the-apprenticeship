"use client";

import { useId, useMemo, useState } from "react";
import { addWorkToSeason, createEdition, createWork } from "@/lib/data";
import { formatOriginalYear } from "@/lib/format";
import { buildImportPreview, IMPORT_TEMPLATE_CSV, readImportFile, type ImportAction, type ImportRow } from "@/lib/importer";
import { SCOPES, WORK_TYPES } from "@/lib/labels";
import { describeError } from "@/lib/supabase";
import { downloadText } from "@/lib/export";
import { BackIcon } from "../icons";
import { useToast } from "../ui";
import { useSeason } from "./context";

const ACTION_LABELS: Record<ImportAction, string> = {
  add: "Add as new work",
  skip: "Skip",
  add_editions: "Add only its new editions to the existing work",
  add_separately: "Add as a separate work anyway",
};

/** Reviewed JSON / CSV import: preview, validate, and choose per row. Nothing saves until confirmed. */
export function ImportView() {
  const { b, go, reload, workById } = useSeason();
  const toast = useToast();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("pasted.csv");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileId = useId();
  const textId = useId();

  function preview(source: string, name: string) {
    setParseError(null);
    setResult(null);
    try {
      const raw = readImportFile(source, name);
      if (!raw.length) throw new Error("No rows found.");
      setRows(buildImportPreview(raw, { works: b.works, editions: b.editions }));
    } catch (e) {
      setRows(null);
      setParseError(e instanceof Error ? `Couldn’t read that: ${e.message}` : "Couldn’t read that file.");
    }
  }

  const counts = useMemo(() => {
    const c = { add: 0, skip: 0, add_editions: 0, add_separately: 0, invalid: 0 };
    for (const r of rows ?? []) {
      if (r.errors.length || !r.work) c.invalid += 1;
      c[r.action] += 1;
    }
    return c;
  }, [rows]);

  async function runImport() {
    if (!rows) return;
    setBusy(true);
    let works = 0;
    let editions = 0;
    const failures: string[] = [];
    for (const row of rows) {
      if (row.action === "skip" || !row.work || row.errors.length) continue;
      try {
        let workId: string;
        if (row.action === "add_editions" && row.matchWorkId) {
          workId = row.matchWorkId;
        } else {
          const { scope, ...fields } = row.work;
          void scope;
          const created = await createWork({ ...fields, author_id: b.author.id });
          workId = created.id;
          works += 1;
        }
        if (!b.seasonWorks.some((sw) => sw.work_id === workId)) {
          await addWorkToSeason({ apprenticeship_id: b.season.id, work_id: workId, scope: row.work.scope }).catch((e) => {
            if ((e as { code?: string }).code !== "23505") throw e;
          });
        }
        for (const ed of row.editions) {
          await createEdition({ ...ed, work_id: workId });
          editions += 1;
        }
      } catch (e) {
        failures.push(`“${row.work.title}”: ${describeError(e)}`);
      }
    }
    await reload();
    setBusy(false);
    const summary = `Imported ${works} ${works === 1 ? "work" : "works"} and ${editions} ${editions === 1 ? "edition" : "editions"}.`;
    setResult(failures.length ? `${summary} Some rows didn’t import: ${failures.join("; ")}` : summary);
    if (!failures.length) {
      toast(summary);
      setRows(null);
      setText("");
    }
  }

  const setAction = (index: number, action: ImportAction) => setRows((cur) => cur?.map((r) => (r.index === index ? { ...r, action } : r)) ?? null);

  return (
    <div className="stack" style={{ ["--gap" as string]: "1.25rem" }}>
      <button type="button" className="btn btn-quiet btn-sm" style={{ justifySelf: "start", marginLeft: "-0.5rem" }} onClick={() => go({ view: null })}>
        <BackIcon /> Works
      </button>
      <div>
        <h2>Import works</h2>
        <p className="muted" style={{ margin: 0 }}>
          Bring in a list as CSV or JSON. You’ll see every row first; duplicates are flagged and nothing already in your bibliography is ever
          overwritten.
        </p>
      </div>

      <div className="card stack">
        <div className="field">
          <label htmlFor={fileId}>Choose a file</label>
          <input
            id={fileId}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const content = await f.text();
              setFileName(f.name);
              setText(content);
              preview(content, f.name);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={textId}>…or paste it here</label>
          <textarea id={textId} className="textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: "ui-monospace, monospace", fontSize: 14 }} />
          <div className="field-hint">
            Columns: <code>title</code> (required), <code>type</code>, <code>original_year</code>, <code>year_note</code>, <code>genre</code>, <code>scope</code>,{" "}
            <code>description</code>, <code>sources</code>, and edition columns <code>publisher</code>, <code>publication_year</code>, <code>isbn</code>,{" "}
            <code>translator</code>, <code>editor</code>, <code>format</code>, <code>page_count</code>, <code>abridged</code>, <code>external_url</code>. Rows
            sharing a title become editions of one work. JSON may be an array of works with an optional <code>editions</code> array.
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => preview(text, fileName)}>
            Preview
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => downloadText("apprenticeship-works-template.csv", IMPORT_TEMPLATE_CSV, "text/csv")}>
            Download a template
          </button>
        </div>
        {parseError && (
          <p className="notice notice-error" role="alert" style={{ margin: 0 }}>
            {parseError}
          </p>
        )}
      </div>

      {rows && (
        <section className="stack" aria-labelledby="preview-h">
          <div className="row row-between">
            <h3 id="preview-h" style={{ margin: 0 }}>
              Preview · {rows.length} {rows.length === 1 ? "row" : "rows"}
            </h3>
            <span className="small muted">
              {counts.add + counts.add_separately} to add · {counts.add_editions} editions only · {counts.skip} skipped
              {counts.invalid ? ` · ${counts.invalid} need fixing` : ""}
            </span>
          </div>
          <ul className="list card">
            {rows.map((r) => (
              <li key={r.index} className="stack" style={{ padding: "0.9rem 0", ["--gap" as string]: "0.4rem" }}>
                <div className="row row-between" style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <div className="serif" style={{ fontSize: "1.05rem" }}>
                      {r.work ? <em>{r.work.title}</em> : <span className="muted">Row {r.index + 1} (no title)</span>}
                    </div>
                    {r.work && (
                      <div className="small muted">
                        {formatOriginalYear(r.work)} · {WORK_TYPES[r.work.work_type]} · {SCOPES[r.work.scope].label}
                        {r.editions.length > 0 && ` · ${r.editions.length} ${r.editions.length === 1 ? "edition" : "editions"}`}
                      </div>
                    )}
                  </div>
                  {r.work && !r.errors.length && (
                    <div>
                      <label className="visually-hidden" htmlFor={`act-${r.index}`}>
                        What to do with this row
                      </label>
                      <select id={`act-${r.index}`} className="select" value={r.action} onChange={(e) => setAction(r.index, e.target.value as ImportAction)} style={{ minWidth: 200 }}>
                        {(r.matchWorkId ? (["skip", "add_editions", "add_separately"] as ImportAction[]) : (["add", "skip"] as ImportAction[])).map((a) => (
                          <option key={a} value={a} disabled={a === "add_editions" && r.editions.length === 0}>
                            {ACTION_LABELS[a]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {r.matchWorkId && (
                  <p className="notice notice-warm small" style={{ margin: 0 }}>
                    Possible duplicate: {r.matchReason} (“{workById.get(r.matchWorkId)?.title ?? "existing work"}”). Existing details won’t be changed.
                  </p>
                )}
                {r.duplicateOfRow != null && <p className="notice notice-warm small" style={{ margin: 0 }}>Repeats an earlier row in this file; skipped unless you choose otherwise.</p>}
                {r.errors.map((err) => (
                  <p key={err} className="field-error" style={{ margin: 0 }}>
                    {err}
                  </p>
                ))}
                {r.warnings.map((w) => (
                  <p key={w} className="small muted" style={{ margin: 0 }}>
                    {w}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          {result && (
            <p className="notice" role="status">
              {result}
            </p>
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-quiet" onClick={() => setRows(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || counts.add + counts.add_separately + counts.add_editions === 0} onClick={runImport}>
              {busy ? "Importing…" : "Import selected rows"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
