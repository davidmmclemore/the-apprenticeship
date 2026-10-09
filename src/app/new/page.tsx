"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Brand, RequireAuth } from "@/components/app-shell";
import { BackIcon } from "@/components/icons";
import { ErrorNotice, Field, LoadingBlock } from "@/components/ui";
import { createAuthor, createSeason, listAuthors, listSeasons } from "@/lib/data";
import { formatDay, todayISO } from "@/lib/format";
import { SEASON_STATUS } from "@/lib/labels";
import { describeError } from "@/lib/supabase";
import { useLoad } from "@/lib/use-load";

export default function NewSeasonPage() {
  return (
    <RequireAuth>
      <NewSeason />
    </RequireAuth>
  );
}

function NewSeason() {
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(null, async () => {
    const [authors, seasons] = await Promise.all([listAuthors(), listSeasons()]);
    return { authors, seasons };
  });
  const [authorId, setAuthorId] = useState<string>("new");
  const [authorName, setAuthorName] = useState("");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const ids = { author: useId(), name: useId(), title: useId(), purpose: useId(), start: useId(), end: useId() };

  const authors = useMemo(() => (data?.authors ?? []).filter((a) => !a.archived_at), [data]);
  const chosenAuthor = authors.find((a) => a.id === authorId);
  const displayName = chosenAuthor?.name ?? authorName.trim();
  const earlier = (data?.seasons ?? []).filter((s) => s.author_id === authorId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (authorId === "new" && !authorName.trim()) return setFormError("Add the author’s name.");
    const finalTitle = title.trim() || (displayName ? `Reading ${displayName}` : "");
    if (!finalTitle) return setFormError("Give this season a title.");
    if (startDate && endDate && endDate < startDate) return setFormError("The target end date is before the start date.");
    setBusy(true);
    try {
      const author = authorId === "new" ? await createAuthor({ name: authorName.trim() }) : chosenAuthor!;
      const season = await createSeason({
        author_id: author.id,
        title: finalTitle,
        purpose: purpose.trim() || null,
        start_date: startDate || (startNow ? todayISO() : null),
        target_end_date: endDate || null,
        status: startNow ? "active" : "planned",
      });
      router.push(`/season?id=${season.id}&tab=works&welcome=1`);
    } catch (err) {
      setFormError(describeError(err));
      setBusy(false);
    }
  }

  function suggestYear() {
    const base = startDate || todayISO();
    const [y, m, d] = base.split("-").map(Number);
    const end = new Date(y + 1, m - 1, d);
    setEndDate(todayISO(end));
  }

  return (
    <main id="main" className="page page-narrow">
      <header className="app-header">
        <Brand />
        <Link href="/" className="btn btn-quiet">
          <BackIcon /> Shelf
        </Link>
      </header>
      <h1>Begin an apprenticeship</h1>
      <p className="lede">Choose an author and say why you’re turning to them now. Everything else can come later.</p>

      {loading && !data && <LoadingBlock />}
      {error && <ErrorNotice error={error} onRetry={reload} />}

      {data && (
        <form className="card stack" style={{ ["--gap" as string]: "1.25rem" }} onSubmit={submit} noValidate>
          <Field label="Author" htmlFor={ids.author}>
            <select id={ids.author} className="select" value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
              <option value="new">A new author…</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          {authorId === "new" && (
            <Field label="Author’s name" htmlFor={ids.name}>
              <input id={ids.name} className="input" value={authorName} onChange={(e) => setAuthorName(e.target.value)} autoComplete="off" placeholder="e.g. C. S. Lewis" />
            </Field>
          )}

          {earlier.length > 0 && (
            <div className="notice" role="note">
              You’ve spent time with {chosenAuthor?.name} before:{" "}
              {earlier.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && "; "}
                  <Link href={`/season?id=${s.id}`}>{s.title}</Link> ({SEASON_STATUS[s.status].toLowerCase()}
                  {s.completed_on ? `, ${formatDay(s.completed_on)}` : ""})
                </span>
              ))}
              . This begins a new season; earlier ones stay exactly as they are, and you can consult them from this one.
            </div>
          )}

          <Field label="Title" htmlFor={ids.title} hint={displayName ? `Leave blank for “Reading ${displayName}”.` : "For example, “A Year with C. S. Lewis”."}>
            <input id={ids.title} className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
          </Field>

          <Field label="What draws me to this author now?" htmlFor={ids.purpose} hint="Optional, and only for you. You’ll see it again when you look back.">
            <textarea id={ids.purpose} className="textarea textarea-quote" value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={4} />
          </Field>

          <fieldset>
            <legend>Season</legend>
            <div className="stack">
              <div className="segmented" role="group" aria-label="When does this season begin?">
                <button type="button" aria-pressed={startNow} onClick={() => setStartNow(true)}>
                  Begin now
                </button>
                <button type="button" aria-pressed={!startNow} onClick={() => setStartNow(false)}>
                  Plan for later
                </button>
              </div>
              <div className="grid-2">
                <Field label="Start date (optional)" htmlFor={ids.start} hint={startNow && !startDate ? "Today, unless you choose another day." : undefined}>
                  <input id={ids.start} className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </Field>
                <Field label="Target end date (optional)" htmlFor={ids.end}>
                  <input id={ids.end} className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </Field>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                A year is a good shape for a season, never a requirement.{" "}
                <button type="button" className="link-button" onClick={suggestYear}>
                  Set a year from the start
                </button>
                {endDate && (
                  <>
                    {" · "}
                    <button type="button" className="link-button" onClick={() => setEndDate("")}>
                      No target date
                    </button>
                  </>
                )}
              </p>
            </div>
          </fieldset>

          {formError && <p className="notice notice-error" role="alert">{formError}</p>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Link href="/" className="btn btn-quiet">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create season"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
