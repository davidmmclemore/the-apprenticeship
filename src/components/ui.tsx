"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import type { SaveState } from "@/lib/local/sync";

// Sheet (modal dialog) ---------------------------------------------------------

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  description?: ReactNode;
}

/** Native <dialog>: focus is trapped and restored, Escape closes. */
export function Sheet({ open, onClose, title, children, wide, description }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sheet${wide ? " sheet-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sheet-panel">
          <div className="sheet-head">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <div className="muted small" style={{ marginTop: 4 }}>{description}</div>}
            </div>
            <button type="button" className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// Confirm -------------------------------------------------------------------

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
  requireText,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  /** For permanent deletion: the reader must type this to confirm. */
  requireText?: string;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset local state when the external session or dialog changes.
      setTyped("");
      setError(null);
    }
  }, [open]);
  const blocked = Boolean(requireText) && typed.trim() !== requireText;
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="stack">
        <div>{body}</div>
        {requireText && (
          <div className="field">
            <label htmlFor={inputId}>
              Type <strong>{requireText}</strong> to confirm
            </label>
            <input id={inputId} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            disabled={blocked || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// Toasts --------------------------------------------------------------------

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<(message: string, opts?: { tone?: "info" | "error"; action?: Toast["action"] }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((message: string, opts?: { tone?: "info" | "error"; action?: Toast["action"] }) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, message, tone: opts?.tone ?? "info", action: opts?.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.tone === "error" ? 9000 : 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.tone === "error" ? " toast-error" : ""}`} role={t.tone === "error" ? "alert" : undefined}>
            <span>{t.message}</span>
            {t.action && (
              <button type="button" className="link-button" onClick={t.action.run}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// Save state ------------------------------------------------------------------

const SAVE_LABELS: Record<SaveState | "unsaved", string> = {
  unsaved: "Not saved yet",
  local: "Saved on this device",
  syncing: "Syncing…",
  saved: "Saved to account",
  failed: "Sync failed",
  conflict: "Changed elsewhere — choose a version",
};

export function SaveBadge({ state, detail }: { state: SaveState | "unsaved"; detail?: string | null }) {
  return (
    <span className="save-state" data-state={state} role="status" aria-live="polite" title={detail ?? undefined}>
      {SAVE_LABELS[state]}
    </span>
  );
}

// Misc -----------------------------------------------------------------------

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ornament" aria-hidden>
        ❦
      </div>
      <h3>{title}</h3>
      {children && <div>{children}</div>}
      {action && <div style={{ marginTop: "1rem" }}>{action}</div>}
    </div>
  );
}

export function ErrorNotice({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="notice notice-error row row-between" role="alert">
      <span>{error}</span>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function LoadingBlock({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "0.6rem" }} aria-busy="true" aria-label={label}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: i === 0 ? 28 : 16, width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** Small busy-state helper for async buttons. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);
  return [busy, run] as const;
}
