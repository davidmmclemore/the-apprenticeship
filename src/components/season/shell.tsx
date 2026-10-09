"use client";

import Link from "next/link";
import { useState, type ComponentType, type SVGProps } from "react";
import { Brand } from "../app-shell";
import { BackIcon, DeskIcon, InheritanceIcon, MoreIcon, NotebookIcon, PenIcon, RouteIcon, WorksIcon } from "../icons";
import { ErrorNotice, LoadingBlock } from "../ui";
import { formatTimestamp } from "@/lib/format";
import { SEASON_STATUS } from "@/lib/labels";
import { CaptureSheet } from "./capture";
import { SeasonProvider, TABS, useSeason, type Tab } from "./context";
import { Desk } from "./desk";
import { InheritanceTab } from "./inheritance";
import { NotebookTab } from "./notebook";
import { RouteTab } from "./route";
import { SeasonSettings } from "./settings";
import { WorksTab } from "./works";

const ICONS: Record<Tab, ComponentType<SVGProps<SVGSVGElement>>> = {
  desk: DeskIcon,
  works: WorksIcon,
  route: RouteIcon,
  notebook: NotebookIcon,
  inheritance: InheritanceIcon,
};

export function SeasonShell({ id }: { id: string }) {
  return (
    <SeasonProvider
      id={id}
      fallback={({ error, loading, reload }) => (
        <main id="main" className="page page-narrow">
          <header className="app-header">
            <Brand />
          </header>
          {loading && <LoadingBlock lines={5} label="Opening this season" />}
          {error && !loading && (
            <div className="stack">
              <ErrorNotice error={error} onRetry={reload} />
              <Link href="/">Back to your shelf</Link>
            </div>
          )}
        </main>
      )}
    >
      <SeasonFrame />
    </SeasonProvider>
  );
}

function SeasonFrame() {
  const { b, nav, go, offlineCopyFrom } = useSeason();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { season, author } = b;

  const hrefFor = (tab: Tab) => `/season?id=${season.id}${tab === "desk" ? "" : `&tab=${tab}`}`;

  return (
    <>
      <main id="main" className="page has-tabbar">
        <header className="season-header">
          <div className="grow">
            <div className="row" style={{ ["--gap" as string]: "0.4rem", marginBottom: "0.4rem" }}>
              <Link href="/" className="btn btn-quiet btn-sm" style={{ marginLeft: "-0.6rem" }}>
                <BackIcon /> Shelf
              </Link>
            </div>
            <p className="eyebrow">
              {author.name}
              {season.status !== "active" && (
                <>
                  {" · "}
                  <span className={season.status === "completed" ? "chip chip-green" : "chip"}>{SEASON_STATUS[season.status]}</span>
                </>
              )}
            </p>
            <h1>{season.title}</h1>
          </div>
          <button type="button" className="btn btn-quiet btn-icon" aria-label="Season settings" onClick={() => setSettingsOpen(true)}>
            <MoreIcon />
          </button>
        </header>

        <nav className="season-nav" aria-label="Season">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={hrefFor(t.id)}
              aria-current={nav.tab === t.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go({ tab: t.id });
              }}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {offlineCopyFrom && (
          <p className="notice notice-warm" role="status">
            Showing what this device last loaded ({formatTimestamp(offlineCopyFrom)}). You can still capture notes; other changes need a connection.
          </p>
        )}
        {season.status === "completed" && (
          <p className="notice" role="note">
            This season is complete. Its scope and route at completion are preserved; anything you change now is recorded separately.
          </p>
        )}
        {season.status === "archived" && (
          <p className="notice" role="note">
            This season is archived. Nothing has been removed; restore it from Season settings whenever you like.
          </p>
        )}

        {nav.tab === "desk" && <Desk onCapture={() => setCaptureOpen(true)} />}
        {nav.tab === "works" && <WorksTab />}
        {nav.tab === "route" && <RouteTab />}
        {nav.tab === "notebook" && <NotebookTab />}
        {nav.tab === "inheritance" && <InheritanceTab />}
      </main>

      {nav.tab !== "desk" && (
        <button type="button" className="btn btn-accent fab" onClick={() => setCaptureOpen(true)}>
          <PenIcon /> Capture
        </button>
      )}

      <nav className="tabbar" aria-label="Season">
        {TABS.map((t) => {
          const Icon = ICONS[t.id];
          return (
            <Link
              key={t.id}
              href={hrefFor(t.id)}
              aria-current={nav.tab === t.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go({ tab: t.id });
              }}
            >
              <Icon />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <CaptureSheet open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <SeasonSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
