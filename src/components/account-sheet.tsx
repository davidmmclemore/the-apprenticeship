"use client";

import { useState } from "react";
import { useApp } from "./providers";
import { Sheet } from "./ui";

/** Account, installation help, and an honest note about offline behaviour. */
export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, outbox, signOut, storeError } = useApp();
  const [erase, setErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const waiting = outbox.length;

  return (
    <Sheet open={open} onClose={onClose} title="Your study">
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Signed in as <strong>{user?.email}</strong>
        </p>

        <section className="card-quiet stack" style={{ ["--gap" as string]: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Install on your devices</h3>
          <p className="small" style={{ margin: 0 }}>
            <strong>iPhone:</strong> open this site in Safari, tap the Share button, then <em>Add to Home Screen</em>.
          </p>
          <p className="small" style={{ margin: 0 }}>
            <strong>Chrome on Mac:</strong> choose the install icon at the right of the address bar (or ⋮ → <em>Cast, save, and share</em> →{" "}
            <em>Install page as app</em>).
          </p>
        </section>

        <section className="card-quiet stack" style={{ ["--gap" as string]: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Working offline</h3>
          <p className="small" style={{ margin: 0 }}>
            Without a connection you can open the app, see what this device last loaded for a season, and capture new notes. Notes are kept on this
            device and sync to your account when you reconnect; each note shows whether it is <em>saved on this device</em>, <em>syncing</em>, or{" "}
            <em>saved to account</em>. Editing works, routes and other records needs a connection.
          </p>
          {storeError && (
            <p className="notice notice-warm small" style={{ margin: 0 }}>
              This browser isn’t allowing on-device storage ({storeError}), so offline capture is unavailable here. Notes still save directly to your
              account when you’re online.
            </p>
          )}
        </section>

        <section className="stack" style={{ ["--gap" as string]: "0.6rem" }}>
          {waiting > 0 && (
            <p className="notice notice-warm" role="alert" style={{ margin: 0 }}>
              {waiting === 1 ? "One note hasn’t" : `${waiting} notes haven’t`} reached your account yet. If you sign out now they stay safely on this
              device and will sync the next time you sign in here.
            </p>
          )}
          <label className="checkbox">
            <input type="checkbox" checked={erase} onChange={(e) => setErase(e.target.checked)} disabled={waiting > 0} />
            <span>
              Also remove this account’s offline copy from this device
              {waiting > 0 && <span className="muted"> (unavailable while notes are waiting to sync)</span>}
            </span>
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signOut({ eraseDevice: erase && waiting === 0 });
                window.location.assign("/sign-in");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </section>
      </div>
    </Sheet>
  );
}
