"use client";

import { useId, useState } from "react";
import { createExternalLink, deleteExternalLink } from "@/lib/data";
import { EXTERNAL_APPS } from "@/lib/labels";
import type { ExternalApp, ExternalLink } from "@/lib/types";
import { LinkIcon } from "../icons";
import { useSeason } from "./context";

type Target = { apprenticeship_id: string } | { author_id: string } | { work_id: string } | { edition_id: string };

/**
 * Optional, labelled links to records in other apps (Personal Library, The
 * Study, or anything else). These are plain links: no integration with those
 * apps is assumed and nothing is read from or written to them.
 */
export function ExternalLinks({ target, links }: { target: Target; links: ExternalLink[] }) {
  const { act } = useSeason();
  const [adding, setAdding] = useState(false);
  const [app, setApp] = useState<ExternalApp>("personal_library");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!/^https?:\/\//i.test(url.trim())) return setError("Use a full link starting with https://");
    setError(null);
    const ok = await act(() => createExternalLink({ ...target, app, label: label.trim() || EXTERNAL_APPS[app], url: url.trim() }), "Link added.");
    if (ok) {
      setAdding(false);
      setLabel("");
      setUrl("");
    }
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "0.5rem" }}>
      {links.length > 0 && (
        <ul className="list">
          {links.map((l) => (
            <li key={l.id} className="list-item" style={{ padding: "0.5rem 0" }}>
              <LinkIcon />
              <div className="grow">
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
                <div className="small muted">{EXTERNAL_APPS[l.app]}</div>
              </div>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => act(() => deleteExternalLink(l.id), "Link removed.")}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form className="stack card-quiet" onSubmit={add} style={{ ["--gap" as string]: "0.6rem" }}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor={`${uid}-app`}>Where it lives</label>
              <select id={`${uid}-app`} className="select" value={app} onChange={(e) => setApp(e.target.value as ExternalApp)}>
                {(Object.keys(EXTERNAL_APPS) as ExternalApp[]).map((a) => (
                  <option key={a} value={a}>
                    {EXTERNAL_APPS[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${uid}-label`}>Label</label>
              <input id={`${uid}-label`} className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={EXTERNAL_APPS[app]} />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-url`}>Link</label>
            <input id={`${uid}-url`} className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            {error && <div className="field-error">{error}</div>}
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-sm btn-primary">
              Add link
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="link-button small" style={{ justifySelf: "start" }} onClick={() => setAdding(true)}>
          Add a link to another app
        </button>
      )}
    </div>
  );
}
