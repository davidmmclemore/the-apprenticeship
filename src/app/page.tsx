"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AccountSheet } from "@/components/account-sheet";
import { Brand, RequireAuth } from "@/components/app-shell";
import { Cover, clothFor } from "@/components/cover";
import { MoreIcon, PlusIcon } from "@/components/icons";
import { EmptyState, ErrorNotice, LoadingBlock } from "@/components/ui";
import { listAuthors, listCurrentSessions, listSeasons, listWorksByIds } from "@/lib/data";
import { formatDay, formatPosition, formatTimestamp, relativeTime, truncate } from "@/lib/format";
import { SEASON_STATUS } from "@/lib/labels";
import type { Apprenticeship, Author, ReadingSession, Work } from "@/lib/types";
import { useLoad } from "@/lib/use-load";

interface ShelfData {
  seasons: Apprenticeship[];
  authors: Author[];
  currentSessions: ReadingSession[];
  works: Work[];
}

async function loadShelf(): Promise<ShelfData> {
  const [seasons, authors, current] = await Promise.all([listSeasons(), listAuthors(), listCurrentSessions()]);
  const works = await listWorksByIds([...new Set(current.map((s) => s.work_id))]);
  return { seasons, authors, currentSessions: current, works };
}

export default function Home() {
  return (
    <RequireAuth>
      <Shelf />
    </RequireAuth>
  );
}

function Shelf() {
  const { data, error, loading, offlineCopyFrom, reload } = useLoad("shelf", loadShelf);
  const [accountOpen, setAccountOpen] = useState(false);

  const view = useMemo(() => {
    if (!data) return null;
    const authorById = new Map(data.authors.map((a) => [a.id, a]));
    const workById = new Map(data.works.map((w) => [w.id, w]));
    const currentBySeason = new Map<string, ReadingSession[]>();
    for (const s of data.currentSessions) currentBySeason.set(s.apprenticeship_id, [...(currentBySeason.get(s.apprenticeship_id) ?? []), s]);
    const by = (status: Apprenticeship["status"]) => data.seasons.filter((s) => s.status === status);
    return { authorById, workById, currentBySeason, active: by("active"), paused: by("paused"), planned: by("planned"), completed: by("completed"), archived: by("archived") };
  }, [data]);

  return (
    <main id="main" className="page">
      <header className="app-header">
        <Brand />
        <div className="row">
          <Link href="/new" className="btn btn-primary">
            <PlusIcon /> <span>New apprenticeship</span>
          </Link>
          <button type="button" className="btn btn-quiet btn-icon" aria-label="Account and settings" onClick={() => setAccountOpen(true)}>
            <MoreIcon />
          </button>
        </div>
      </header>

      {offlineCopyFrom && (
        <p className="notice notice-warm" role="status">
          You’re seeing what this device last loaded ({formatTimestamp(offlineCopyFrom)}). It will refresh when you’re back online.
        </p>
      )}
      {error && <ErrorNotice error={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock lines={4} label="Loading your shelf" />}

      {view && data && data.seasons.length === 0 && (
        <div style={{ marginTop: "8vh" }}>
          <EmptyState
            title="Your study is ready"
            action={
              <Link href="/new" className="btn btn-primary">
                Begin an apprenticeship
              </Link>
            }
          >
            <p className="lede">Spend a season inside one author’s work, and keep what you learn.</p>
            <p>
              For example: <em>A Year with C. S. Lewis</em>, <em>Reading John Stott</em>, or <em>The Novels of Marilynne Robinson</em>. A year is only a
              suggestion; a season can be as long as it needs to be.
            </p>
          </EmptyState>
        </div>
      )}

      {view && view.active.length > 0 && (
        <section aria-labelledby="in-season">
          <p className="eyebrow" id="in-season">
            In season
          </p>
          <div className="shelf">
            {view.active.map((s) => (
              <SeasonCard key={s.id} season={s} author={view.authorById.get(s.author_id)} current={view.currentBySeason.get(s.id) ?? []} workById={view.workById} large />
            ))}
          </div>
        </section>
      )}

      {view && (view.paused.length > 0 || view.planned.length > 0) && (
        <section className="section" aria-labelledby="waiting">
          <div className="section-head">
            <h2 id="waiting">Paused and planned</h2>
          </div>
          <div className="shelf">
            {[...view.paused, ...view.planned].map((s) => (
              <SeasonCard key={s.id} season={s} author={view.authorById.get(s.author_id)} current={view.currentBySeason.get(s.id) ?? []} workById={view.workById} />
            ))}
          </div>
        </section>
      )}

      {view && view.completed.length > 0 && (
        <section className="section" aria-labelledby="completed">
          <div className="section-head">
            <h2 id="completed">Completed seasons</h2>
            <span className="muted small">Kept as they were</span>
          </div>
          <div className="spines" role="list">
            {view.completed.map((s) => (
              <Link
                role="listitem"
                key={s.id}
                href={`/season?id=${s.id}`}
                className="spine"
                style={{ ["--cloth" as string]: clothFor(s.title) }}
                title={`${s.title}${s.completed_on ? ` — completed ${formatDay(s.completed_on)}` : ""}`}
              >
                {s.title}
              </Link>
            ))}
          </div>
          <div className="shelf-board" aria-hidden />
        </section>
      )}

      {view && view.archived.length > 0 && (
        <details className="section disclosure">
          <summary className="muted">Archived ({view.archived.length})</summary>
          <ul className="list" style={{ marginTop: "0.75rem" }}>
            {view.archived.map((s) => (
              <li key={s.id} className="list-item">
                <Link href={`/season?id=${s.id}`}>{s.title}</Link>
                <span className="muted small">{view.authorById.get(s.author_id)?.name}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </main>
  );
}

function SeasonCard({
  season,
  author,
  current,
  workById,
  large,
}: {
  season: Apprenticeship;
  author?: Author;
  current: ReadingSession[];
  workById: Map<string, Work>;
  large?: boolean;
}) {
  const primary = current.find((s) => s.is_primary) ?? current[0];
  const work = primary ? workById.get(primary.work_id) : undefined;
  return (
    <Link href={`/season?id=${season.id}`} className="card season-card">
      <Cover title={work?.title ?? season.title} author={author?.name} url={work?.cover_url} width={large ? 92 : 72} />
      <div className="grow">
        <p className="eyebrow">
          {author?.name}
          {season.status !== "active" && <> · {SEASON_STATUS[season.status]}</>}
        </p>
        <h3>{season.title}</h3>
        {work ? (
          <p className="small" style={{ margin: 0 }}>
            Reading <em>{work.title}</em>
            {primary?.position_value && <span className="muted"> · {formatPosition(primary.position_kind, primary.position_value)}</span>}
            {primary?.position_updated_at && <span className="muted"> · {relativeTime(primary.position_updated_at)}</span>}
            {current.length > 1 && <span className="muted"> · and {current.length - 1} more</span>}
          </p>
        ) : (
          season.purpose && <p className="small muted" style={{ margin: 0 }}>{truncate(season.purpose, 120)}</p>
        )}
      </div>
    </Link>
  );
}
