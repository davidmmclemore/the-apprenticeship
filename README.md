# The Apprenticeship

A private reading study for a sustained season inside an author’s work. Arrange a reading route, track sessions, keep quotations and questions, and gather what you want to carry forward.

Built with Next.js 16, React 19, TypeScript, Supabase Auth/Postgres, Tiptap, and per-account IndexedDB storage.

## Local setup

Use Node.js 22 or newer (Node.js 24 LTS recommended).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with your Supabase project URL and **publishable** key from the dashboard. These two values are intentionally public browser configuration. Never use a service-role key, database password, or privileged token in a `NEXT_PUBLIC_` variable. Open http://localhost:3000.

The existing deployment uses **The Gathered Pages** project, with all app data in the dedicated `apprenticeship` schema. Auth accounts are shared with that project; reading records are private to each owner. The app does not modify other apps’ schemas or auth configuration.

### Supabase setup

The three migrations under `supabase/migrations/` are already applied to the Gathered Pages project. **Do not reapply them there.** For a fresh project, apply them once in filename order using the Supabase CLI or dashboard SQL editor.

1. In the project dashboard, open **Integrations → Data API → Settings** (formerly Project Settings → Data API). Add `apprenticeship` to **Exposed schemas**, preserving every existing entry. The migrations already grant the schema/table/function permissions; exposing it is a separate API setting. A `PGRST106`/`PGRST205` error means the schema is not reachable through the Data API.
2. In **Authentication → URL Configuration → Redirect URLs**, add `http://localhost:3000/sign-in**` for development and `https://YOUR-DEPLOYED-HOST/sign-in**` for the deployed app. The sign-in callback carries a `next` query parameter. Use exact trusted hosts; avoid broad production wildcards. Do not replace another app’s existing Site URL or redirects on this shared project.
3. Use an existing Gathered Pages account, or create an account if the project permits signup. Email delivery, confirmation requirements, password policy, and rate limits use the project’s existing Auth settings.

Email links use PKCE: request and open the link in the same browser/device. Password sign-in is also available. The app does not provide anonymous sign-in.

## Deploy on Vercel

Import `davidmmclemore/the-apprenticeship` into Vercel, choose **Next.js**, and keep the default install/build/output settings (`npm ci`, `npm run build`). Select Node.js 24. No custom Vercel config or workflow service is needed.

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the intended Preview/Production environments before building. Next.js embeds these public values at build time; redeploy after changing them. Preserve the existing shared Supabase project’s other integrations and auth settings.

For CLI deployment, upgrade the CLI first:

```sh
npm i -g vercel@latest
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env pull .env.local
vercel
```

After Vercel assigns the deployment hostname, add its `/sign-in**` URL to Supabase Auth’s allowed redirects. Use a stable preview hostname or explicitly allow each trusted preview host. Deploy production only after reviewing the draft PR and checking the real sign-in/data flow.

## Reading and offline use

- Desk: current reading and return-to-reading orientation.
- Works: bibliography, editions, season scope, favorites, and reviewed CSV/JSON import.
- Route: arrange works and intentions without turning reading into a deadline score.
- Notebook: quotations, reflections, observations, questions, themes, and history.
- Inheritance: takeaways, intentions, retrospective, and Markdown/JSON downloads.
- Season settings: edit dates/purpose, pause/resume, complete with a permanent snapshot, archive/restore, or permanently delete after typing the season title.

Install from the browser’s app/install menu (iOS: Share → Add to Home Screen). Service workers run in production builds over HTTPS, or on localhost. Visit the shelf and season online first. The worker caches public app-shell HTML/assets; account records are stored separately in IndexedDB for the signed-in user. Offline reload requires a previously loaded season, cached assets, and an existing session on that device. A new login needs a connection.

Only **notebook captures/edits** have an offline outbox and draft recovery. Inheritance, retrospective, lifecycle changes, imports, and other edits require a connection. Waiting notes sync when the app is open and connectivity returns; this is not operating-system background sync. Concurrent note edits keep both versions for resolution. Completion and deletion are blocked while that season has waiting notes. Retrospective writes check the stored revision before saving; copy your unsaved writing before closing a conflict dialog.

Signing out can preserve waiting notes for the next sign-in by that account. Optional removal of the device copy is unavailable while notes are waiting. Use device-copy removal on shared devices; IndexedDB is browser storage, not encrypted storage. Browser storage may be cleared by the browser or operating system.

A Markdown reader’s guide gathers your reflections, finished works, favorites, selected quotations, themes, questions, and retained takeaways. JSON includes season records, relationships, and snapshots; it is **not** a full account backup or an automatic restore format. Historical entry versions and unresolved conflict copies are not included. Sync first for a complete current account view. The bibliography importer accepts a work array or `{ "works": [...] }` and supports CSV headers such as `title`, `original_year`, `work_type`, `scope`, `publisher`, `isbn`, and `format`; review the duplicate preview before saving.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Playwright starts a production server on port 3100 using a test Supabase origin and intercepts all database requests. It verifies auth gating, takeaways, retrospective, lifecycle requests, typed deletion confirmation, downloads, manifest/icons, and offline reload. It does not log into or mutate the live project. Stop other servers on port 3100 first so the test configuration is used. Unit tests cover route/progress, imports, export, sanitization fallback, per-account storage, and sync retry/conflict behavior.

### Database tests

`supabase/tests/rls.test.sql` checks ownership, cross-account links, anonymous sessions, protected history, and completion snapshots. It uses two existing auth user IDs and always raises an exception to roll back its test writes. **Success deliberately appears as an SQL error containing `ALL_TESTS_PASSED: 54 checks (rolled back)`**. Any `TESTS_FAILED` result is a failure. Run this file through a privileged Supabase SQL connection/tool; never expose those credentials to the app.

For a disposable **local** PostgreSQL instance with `psql` available:

```sh
PGHOST=/tmp PGPORT=54329 PGUSER=postgres npm run test:db
```

`scripts/test-db.sh` drops/recreates `apprenticeship_test` (or `TEST_DB`) and applies the local Supabase stand-in and migrations. **Never point it at a live project.** `supabase/tests/schema-fingerprint.sql` produces hashes for drift comparison without reading app records.

The live Gathered Pages database suite passed all 54 checks again on October 9, 2026; no test records persisted. App browser tests use simulated API responses, so a real authenticated smoke test is still required after exposing the schema and configuring the deployed auth redirect.
