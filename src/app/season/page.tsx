"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RequireAuth } from "@/components/app-shell";
import { SeasonShell } from "@/components/season/shell";
import { LoadingBlock } from "@/components/ui";

export default function SeasonPage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="page">
          <LoadingBlock />
        </main>
      }
    >
      <RequireAuth>
        <SeasonRoute />
      </RequireAuth>
    </Suspense>
  );
}

function SeasonRoute() {
  const id = useSearchParams().get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return (
      <main id="main" className="page page-narrow">
        <p className="notice notice-error">This link doesn’t point to a season.</p>
        <a href="/">Back to your shelf</a>
      </main>
    );
  }
  return <SeasonShell key={id} id={id} />;
}
