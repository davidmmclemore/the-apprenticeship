"use client";

import { useState } from "react";
import { createInheritance, updateInheritance, createRetrospective, updateRetrospective } from "@/lib/data";
import { downloadText, guideToMarkdown, seasonToJson, slugify } from "@/lib/export";
import { todayISO } from "@/lib/format";
import { INHERITANCE_CATEGORIES } from "@/lib/labels";
import { sanitizeHtml } from "@/lib/sanitize";
import type { InheritanceCategory, InheritanceEntry, Retrospective } from "@/lib/types";
import { RichEditor, RichText } from "../rich-editor";
import { EmptyState, Sheet, useToast } from "../ui";
import { useApp } from "../providers";
import { useSeason } from "./context";

const RETROSPECTIVE_FIELDS = [
  ["why_began_html", "Why I began"], ["works_read_html", "Works read"],
  ["favorites_html", "Favorite works and why"], ["quotations_html", "Selected quotations"],
  ["themes_html", "Recurring themes"], ["questions_html", "Unresolved questions"],
  ["recommended_order_html", "My recommended reading order"],
  ["carrying_forward_html", "What I’m carrying forward"], ["concluding_essay_html", "Concluding essay"],
] as const;
type RetrospectiveField = typeof RETROSPECTIVE_FIELDS[number][0];

export function InheritanceTab() {
  const { b, entries, act } = useSeason();
  const { online, outbox } = useApp();
  const [editing, setEditing] = useState<InheritanceEntry | "new" | null>(null);
  const [retrospective, setRetrospective] = useState(false);
  const [archived, setArchived] = useState(false);
  const pending = outbox.some((i) => i.apprenticeshipId === b.season.id);
  const exportBundle = { ...b, entries };
  const items = b.inheritance.filter((i) => archived ? Boolean(i.archived_at) : !i.archived_at);
  return <div className="stack">
    <div className="row row-between"><div><p className="eyebrow">What stays with you</p><h2>Inheritance</h2></div>
      <button className="btn btn-primary" disabled={!online} onClick={() => setEditing("new")}>Add takeaway</button></div>
    <p className="muted">Gather the habits, ideas, and intentions you want to carry into life.</p>
    <label className="row"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Show archived takeaways</label>
    {!items.length && <EmptyState title={archived ? "No archived takeaways" : "What will you carry forward?"}>Add a takeaway whenever something begins to stay with you.</EmptyState>}
    {items.map((item) => <article key={item.id} className="card stack">
      <div className="row row-between"><span className="chip">{INHERITANCE_CATEGORIES[item.category]}</span><span className="muted small">{item.noted_on}</span></div>
      <h3>{item.title}{item.favorite ? " ★" : ""}</h3><RichText html={item.takeaway_html} />
      {item.practical_intention && <p><strong>My intention:</strong> {item.practical_intention}</p>}
      <div className="row"><button className="btn btn-sm" disabled={!online} onClick={() => setEditing(item)}>Edit takeaway</button>
        <button className="btn btn-quiet btn-sm" disabled={!online} onClick={() => void act(() => updateInheritance(item.id, { archived_at: item.archived_at ? null : new Date().toISOString() }), item.archived_at ? "Takeaway restored" : "Takeaway archived")}>{item.archived_at ? "Restore" : "Archive"}</button>
        {item.keep_for_guide && <span className="chip">Kept for guide</span>}</div>
    </article>)}
    <section className="card stack"><h2>Retrospective & reader’s guide</h2><p>Reflect on the season in your own words. Your guide also gathers finished works, favorites, selected quotations, themes, open questions, and takeaways kept for the guide.</p>
      <button className="btn" disabled={!online} onClick={() => setRetrospective(true)}>Write retrospective</button>
      {b.retrospective?.concluding_essay_html && <RichText html={b.retrospective.concluding_essay_html} />}
      {pending && <p className="notice notice-warm">Notes waiting on this device are included. Sync before exporting for a complete account copy; unresolved conflicts and version history are not included.</p>}
      <div className="row"><button className="btn" onClick={() => downloadText(`${slugify(b.season.title)}-guide.md`, guideToMarkdown(exportBundle), "text/markdown;charset=utf-8")}>Export Markdown guide</button>
        <button className="btn" onClick={() => downloadText(`${slugify(b.season.title)}.json`, JSON.stringify(seasonToJson(exportBundle), null, 2), "application/json")}>Export season JSON</button></div>
      <p className="small muted">JSON includes the season’s records, relationships, and completion snapshots. The bibliography importer does not restore a full season export.</p>
    </section>
    {editing && <TakeawayEditor key={typeof editing === "string" ? editing : editing.id} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    {retrospective && <RetrospectiveEditor original={b.retrospective} onClose={() => setRetrospective(false)} />}
  </div>;
}

function TakeawayEditor({ item, onClose }: { item: InheritanceEntry | null; onClose: () => void }) {
  const { b, reload } = useSeason();
  const toast = useToast();
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.takeaway_html ?? "");
  const [category, setCategory] = useState<InheritanceCategory>(item?.category ?? "life");
  const [intention, setIntention] = useState(item?.practical_intention ?? "");
  const [date, setDate] = useState(item?.noted_on ?? todayISO());
  const [favorite, setFavorite] = useState(item?.favorite ?? false);
  const [keep, setKeep] = useState(item?.keep_for_guide ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Sheet open onClose={onClose} title={item ? "Edit takeaway" : "Add takeaway"}><form className="stack" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const values = { title: title.trim(), takeaway_html: sanitizeHtml(body) || null, category, practical_intention: intention.trim() || null, noted_on: date, favorite, keep_for_guide: keep };
      if (item) await updateInheritance(item.id, values);
      else await createInheritance({ ...values, apprenticeship_id: b.season.id });
      await reload(); toast("Takeaway saved"); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }}>
    <label className="field">Title<input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <RichEditor label="Takeaway" value={body} onChange={setBody} />
    <label className="field">Category<select className="input" value={category} onChange={(e) => setCategory(e.target.value as InheritanceCategory)}>{Object.entries(INHERITANCE_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label className="field">Practical intention<textarea className="input" value={intention} onChange={(e) => setIntention(e.target.value)} /></label>
    <label className="field">Noted on<input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
    <label className="row"><input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />Favorite</label>
    <label className="row"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />Keep for reader’s guide</label>
    {error && <p role="alert" className="notice notice-error">{error}</p>}
    <button className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save takeaway"}</button>
  </form></Sheet>;
}

function RetrospectiveEditor({ original, onClose }: { original: Retrospective | null; onClose: () => void }) {
  const { b, reload } = useSeason();
  const [values, setValues] = useState<Record<RetrospectiveField, string>>(() => Object.fromEntries(RETROSPECTIVE_FIELDS.map(([key]) => [key, original?.[key] ?? ""])) as Record<RetrospectiveField, string>);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Sheet open wide onClose={onClose} title="Season retrospective"><form className="stack" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const clean = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, sanitizeHtml(value) || null]));
      if (original) {
        const saved = await updateRetrospective(b.season.id, original.revision, clean);
        if (!saved) throw new Error("This retrospective changed elsewhere. Your writing is still here. Copy it before reopening the latest version.");
      } else await createRetrospective({ ...clean, apprenticeship_id: b.season.id });
      await reload(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }}>
    <p className="muted">Save before closing. Each section adds your reflection to the assembled reader’s guide.</p>
    {RETROSPECTIVE_FIELDS.map(([key, label]) => <section key={key} className="stack"><h3>{label}</h3><RichEditor label={label} value={values[key]} onChange={(html) => setValues((v) => ({ ...v, [key]: html }))} /></section>)}
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save retrospective"}</button>
  </form></Sheet>;
}
