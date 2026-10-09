"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, type ReactNode } from "react";
import { isConfigured } from "@/lib/supabase";
import { BrandMark } from "./icons";
import { useApp } from "./providers";
import { LoadingBlock } from "./ui";

/** Registers the service worker that keeps the app shell available offline. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* The app still works online without it. */
    });
  }, []);
  return null;
}

export function ConnectionBanner() {
  const { online, outbox, user } = useApp();
  if (online || !user) return null;
  const waiting = outbox.filter((i) => i.status !== "conflict").length;
  return (
    <div className="connection" role="status">
      You’re offline. New notes are kept on this device{waiting ? ` (${waiting} waiting)` : ""} and will sync when you reconnect.
    </div>
  );
}

export function ConfigNotice() {
  return (
    <main id="main" className="signin">
      <div className="card signin-card stack">
        <BrandMark width={44} height={44} />
        <h1 style={{ fontSize: "1.8rem" }}>Almost ready</h1>
        <p>
          This deployment doesn’t have its Supabase settings yet. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (see <code>.env.example</code> and the README), then redeploy.
        </p>
      </div>
    </main>
  );
}

/** Renders children only for a signed-in reader; otherwise sends them to sign in. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, user } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isConfigured || !ready || user) return;
    const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : pathname;
    router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
  }, [ready, user, router, pathname]);

  if (!isConfigured) return <ConfigNotice />;
  if (!ready || !user) {
    return (
      <main id="main" className="page page-narrow" aria-busy="true">
        <div style={{ marginTop: "20vh" }}>
          <LoadingBlock label="Opening your study" />
        </div>
      </main>
    );
  }
  return <Fragment key={user.id}>{children}</Fragment>;
}

export function Brand() {
  return (
    <Link href="/" className="brand">
      <BrandMark className="brand-mark" />
      <span>The Apprenticeship</span>
    </Link>
  );
}
