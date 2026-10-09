"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeSeason, deleteSeason, updateSeason } from "@/lib/data";
import { formatTimestamp, todayISO } from "@/lib/format";
import { SEASON_STATUS } from "@/lib/labels";
import type { SeasonStatus } from "@/lib/types";
import { useApp } from "../providers";
import { ConfirmSheet, Sheet, useToast } from "../ui";
import { useSeason } from "./context";

export function SeasonSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="Season settings"><SettingsForm onClose={onClose} /></Sheet>;
}

function SettingsForm({ onClose }: { onClose: () => void }) {
  const { b, reload } = useSeason();
  const { online, outbox, store } = useApp();
  const router = useRouter();
  const toast = useToast();
  const s = b.season;
  const [title, setTitle] = useState(s.title);
  const [purpose, setPurpose] = useState(s.purpose ?? "");
  const [start, setStart] = useState(s.start_date ?? "");
  const [end, setEnd] = useState(s.target_end_date ?? "");
  const [completedOn, setCompletedOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<"complete" | "archive" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = outbox.some((i) => i.apprenticeshipId === s.id);
  async function change(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); await reload(); toast("Season updated"); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const status = (next: SeasonStatus) => change(() => updateSeason(s.id, { status: next }));
  return <div className="stack">
    {!online && <p className="notice notice-warm">Season settings need a connection.</p>}
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void change(() => updateSeason(s.id, { title: title.trim(), purpose: purpose.trim() || null, start_date: start || null, target_end_date: end || null })); }}>
      <label className="field">Season title<input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field">Purpose<textarea className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
      <label className="field">Start date<input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label className="field">Target end date<input className="input" type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      <button className="btn btn-primary" disabled={!online || busy || !title.trim()}>Save season details</button>
    </form>
    {error && <p role="alert" className="notice notice-error">{error}</p>}
    <section className="stack"><h3>{SEASON_STATUS[s.status]}</h3><div className="row">
      {s.status === "planned" && <button className="btn" disabled={!online || busy} onClick={() => void status("active")}>Begin season</button>}
      {s.status === "active" && <button className="btn" disabled={!online || busy} onClick={() => void status("paused")}>Pause season</button>}
      {s.status === "paused" && <button className="btn" disabled={!online || busy} onClick={() => void status("active")}>Resume season</button>}
      {s.status === "archived" && <button className="btn" disabled={!online || busy} onClick={() => void change(() => updateSeason(s.id, { status: s.archived_from_status ?? "planned", archived_from_status: null }))}>Restore season</button>}
      {s.status !== "completed" && s.status !== "archived" && <button className="btn" disabled={!online || busy || pending} onClick={() => setConfirm("complete")}>Complete season</button>}
      {s.status !== "archived" && <button className="btn" disabled={!online || busy} onClick={() => setConfirm("archive")}>Archive season</button>}
    </div></section>
    {pending && <p className="notice notice-warm">Sync or resolve this season’s waiting notes before completing or deleting it.</p>}
    <details><summary>Season history</summary><ul>{b.events.map((event) => <li key={event.id}>{formatTimestamp(event.occurred_at)} · {event.from_status ? SEASON_STATUS[event.from_status] + " → " : ""}{event.to_status ? SEASON_STATUS[event.to_status] : "Dates changed"}</li>)}</ul></details>
    <details><summary>Completion snapshots ({b.snapshots.length})</summary>{b.snapshots.map((snap) => <div key={snap.id} className="card stack"><p>{formatTimestamp(snap.taken_at)} · {snap.reason}</p>{snap.note && <p>{snap.note}</p>}<pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(snap.data, null, 2)}</pre></div>)}</details>
    <button className="btn btn-danger" disabled={!online || busy || pending} onClick={() => setConfirm("delete")}>Delete season permanently</button>
    <ConfirmSheet open={confirm === "archive"} title="Archive this season?" body="The season and its notes will remain available. You can restore it later." confirmLabel="Archive season" onClose={() => setConfirm(null)} onConfirm={async () => { await updateSeason(s.id, { status: "archived", archived_from_status: s.status }); await reload(); }} />
    <ConfirmSheet open={confirm === "complete"} title="Complete this season?" body={<div className="stack"><p>A permanent snapshot will preserve the scope, route, and reading sessions as they stand. You can keep writing afterward.</p><label className="field">Completed on<input className="input" type="date" required value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} /></label><label className="field">Snapshot note<textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label></div>} confirmLabel="Complete season" onClose={() => setConfirm(null)} onConfirm={async () => { if (!completedOn) throw new Error("Choose a completion date."); await completeSeason(s.id, completedOn, note.trim() || null); await reload(); }} />
    <ConfirmSheet open={confirm === "delete"} title="Permanently delete this season?" danger requireText={s.title} body="This deletes the season, its notes, history, and snapshots. The author’s bibliography remains. Export your season from Inheritance first if you want a copy." confirmLabel="Delete permanently" onClose={() => setConfirm(null)} onConfirm={async () => {
      await deleteSeason(s.id);
      await store?.deleteCache(`season:${s.id}`);
      await store?.deleteCache("shelf");
      onClose(); router.replace("/");
    }} />
  </div>;
}
