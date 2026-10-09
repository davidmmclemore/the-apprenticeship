import { test, expect, type Page } from "@playwright/test";
import { bundle, SEASON_ID, USER_ID, NOW } from "../fixture";
import type { InheritanceEntry } from "../../src/lib/types";

async function study(page: Page) {
  const b = bundle();
  let completionCalls = 0;
  let deleteCalls = 0;
  await page.addInitScript(({ userId }) => {
    const user = { id: userId, email: "reader@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
    const token = `e30.${btoa(JSON.stringify({ sub: userId, exp: 4102444800 }))}.test`;
    localStorage.setItem("sb-apprenticeship-test-auth-token", JSON.stringify({ access_token: token, refresh_token: "test-refresh", expires_in: 3600, expires_at: 4102444800, token_type: "bearer", user }));
  }, { userId: USER_ID });
  await page.route("https://apprenticeship-test.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/").at(-1)!;
    const method = req.method();
    let result: unknown = [];
    if (table === "complete_apprenticeship") {
      completionCalls++;
      const body = req.postDataJSON();
      b.season.status = "completed";
      b.season.completed_on = body.p_completed_on;
      result = "snapshot-test-id";
    } else if (table === "apprenticeships") {
      if (method === "PATCH") Object.assign(b.season, req.postDataJSON());
      if (method === "DELETE") deleteCalls++;
      result = url.searchParams.has("id") ? b.season : [b.season];
    } else if (table === "authors") result = url.searchParams.has("id") ? b.author : [b.author];
    else if (table === "works") result = b.works;
    else if (table === "apprenticeship_works") result = b.seasonWorks;
    else if (table === "inheritance_entries") {
      if (method === "POST") {
        const row: InheritanceEntry = { id: crypto.randomUUID(), revision: 1, archived_at: null, created_at: NOW, updated_at: NOW, ...req.postDataJSON() };
        b.inheritance.push(row); result = row;
      } else if (method === "PATCH") {
        const id = url.searchParams.get("id")?.slice(3);
        const row = b.inheritance.find(i => i.id === id)!;
        Object.assign(row, req.postDataJSON()); result = row;
      } else result = b.inheritance;
    } else if (table === "retrospectives") {
      if (method === "POST" || method === "PATCH") {
        b.retrospective = { apprenticeship_id: SEASON_ID, why_began_html: null, works_read_html: null, favorites_html: null, quotations_html: null, themes_html: null, questions_html: null, recommended_order_html: null, carrying_forward_html: null, concluding_essay_html: null, revision: 1, updated_at: NOW, ...req.postDataJSON() };
        result = method === "PATCH" ? [b.retrospective] : b.retrospective;
      } else result = b.retrospective;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
  });
  await page.goto(`/season?id=${SEASON_ID}&tab=inheritance`);
  await expect(page.getByRole("heading", { name: "Inheritance", exact: true })).toBeVisible();
  return { b, completionCalls: () => completionCalls, deleteCalls: () => deleteCalls };
}

test("unauthenticated reader is sent to sign-in with the destination preserved", async ({ page }) => {
  await page.goto(`/season?id=${SEASON_ID}`);
  await expect(page).toHaveURL(/sign-in\?next=/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("takeaway creation, editing, archive, restore and guide export", async ({ page }) => {
  const { b } = await study(page);
  await page.getByRole("button", { name: "Add takeaway" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Attend to ordinary things");
  await page.getByRole("textbox", { name: "Takeaway", exact: true }).fill("Look closely before judging.");
  await page.getByLabel("Practical intention").fill("Keep a daily observation");
  await page.getByRole("button", { name: "Save takeaway" }).click();
  await expect(page.getByRole("heading", { name: "Attend to ordinary things" })).toBeVisible();
  expect(b.inheritance[0].takeaway_html).toContain("Look closely");
  await page.getByRole("button", { name: "Edit takeaway" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Attend patiently");
  await page.getByRole("button", { name: "Save takeaway" }).click();
  await expect(page.getByRole("heading", { name: "Attend patiently" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown guide" }).click();
  expect((await download).suggestedFilename()).toBe("a-season-with-lewis-guide.md");
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Attend patiently" })).toHaveCount(0);
  await page.getByLabel("Show archived takeaways").check();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByLabel("Show archived takeaways").uncheck();
  await expect(page.getByRole("heading", { name: "Attend patiently" })).toBeVisible();
});

test("retrospective is saved and rendered", async ({ page }) => {
  const { b } = await study(page);
  await page.getByRole("button", { name: "Write retrospective" }).click();
  await page.getByRole("textbox", { name: "Concluding essay", exact: true }).fill("Attention became a habit.");
  await page.getByRole("button", { name: "Save retrospective" }).click();
  await expect(page.getByText("Attention became a habit.")).toBeVisible();
  expect(b.retrospective?.concluding_essay_html).toContain("Attention became a habit.");
});

test("pause, resume, archive, restore and completion use the existing operations", async ({ page }) => {
  const s = await study(page);
  await page.getByRole("button", { name: "Season settings" }).click();
  await page.getByRole("button", { name: "Pause season", exact: true }).click();
  await expect.poll(() => s.b.season.status).toBe("paused");
  await page.getByRole("button", { name: "Resume season", exact: true }).click();
  await expect.poll(() => s.b.season.status).toBe("active");
  await page.getByRole("button", { name: "Archive season", exact: true }).click();
  await page.getByRole("dialog", { name: "Archive this season?" }).getByRole("button", { name: "Archive season" }).click();
  await expect.poll(() => s.b.season.status).toBe("archived");
  await page.getByRole("button", { name: "Restore season", exact: true }).click();
  await expect.poll(() => s.b.season.status).toBe("active");
  await page.getByRole("button", { name: "Complete season", exact: true }).click();
  await page.getByLabel("Completed on").fill("2026-10-09");
  await page.getByLabel("Snapshot note").fill("Ready to carry it forward");
  await page.getByRole("dialog", { name: "Complete this season?" }).getByRole("button", { name: "Complete season", exact: true }).click();
  await expect.poll(s.completionCalls).toBe(1);
  expect(s.b.season.status).toBe("completed");
  expect(s.b.season.completed_on).toBe("2026-10-09");
});

test("permanent deletion requires exact title and cancel makes no request", async ({ page }) => {
  const s = await study(page);
  await page.getByRole("button", { name: "Season settings" }).click();
  await page.getByRole("button", { name: "Delete season permanently" }).click();
  const dialog = page.getByRole("dialog", { name: "Permanently delete this season?" });
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  await dialog.getByRole("textbox").fill("wrong");
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  await dialog.getByRole("textbox").fill(s.b.season.title);
  await expect(dialog.getByRole("button", { name: "Delete permanently" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(s.deleteCalls()).toBe(0);
});

test("PWA manifest, worker and icons are served; cached season reloads offline", async ({ page, context }) => {
  await study(page);
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active))).toBe(true);
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).icons).toHaveLength(3);
  for (const path of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"]) expect((await page.request.get(path)).ok()).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Wait for the season bundle to finish writing to per-account IndexedDB.
  await expect.poll(() => page.evaluate(async ({ userId, seasonId }) => new Promise<boolean>((resolve) => {
    const open = indexedDB.open(`the-apprenticeship:${userId}`);
    open.onsuccess = () => { const db = open.result; const req = db.transaction("cache").objectStore("cache").get(`season:${seasonId}`); req.onsuccess = () => { resolve(Boolean(req.result)); db.close(); }; };
  }), { userId: USER_ID, seasonId: SEASON_ID })).toBe(true);
  await page.unrouteAll();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "A season with Lewis", exact: true })).toBeVisible();
  await expect(page.getByText(/Showing what this device last loaded/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add takeaway" })).toBeDisabled();
});
