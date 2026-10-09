import type { SeasonBundle } from "../src/lib/bundle";

export const USER_ID = "00000000-0000-4000-8000-00000000000a";
export const SEASON_ID = "10000000-0000-4000-8000-000000000001";
export const AUTHOR_ID = "20000000-0000-4000-8000-000000000001";
export const WORK_ID = "30000000-0000-4000-8000-000000000001";
export const NOW = "2026-10-09T12:00:00.000Z";

export function bundle(): SeasonBundle {
  return {
    season: { id: SEASON_ID, owner_id: USER_ID, author_id: AUTHOR_ID, title: "A season with Lewis", purpose: "Learn to attend", start_date: "2026-10-01", target_end_date: null, status: "active", archived_from_status: null, completed_on: null, created_at: NOW, updated_at: NOW },
    author: { id: AUTHOR_ID, owner_id: USER_ID, name: "C. S. Lewis", sort_name: null, portrait_url: null, life_dates: "1898–1963", intro_notes_html: null, archived_at: null, created_at: NOW, updated_at: NOW },
    works: [{ id: WORK_ID, owner_id: USER_ID, author_id: AUTHOR_ID, title: "The Abolition of Man", work_type: "book", genre: null, original_year: 1943, original_year_approximate: false, year_note: null, description: null, cover_url: null, sources: null, verification_note: null, archived_at: null, created_at: NOW, updated_at: NOW }],
    seasonWorks: [{ apprenticeship_id: SEASON_ID, work_id: WORK_ID, scope: "essential", selection_note: null, favorite: true, favorite_note: "Worth returning to", keep_for_guide: true, created_at: NOW, updated_at: NOW }],
    entries: [], authorFacts: [], editions: [], collectionMembers: [], sections: [], steps: [], intentions: [], sessions: [], themes: [], entryThemes: [], links: [], carries: [], inheritance: [], inheritanceLinks: [], retrospective: null, externalLinks: [], events: [], snapshots: [], siblingSeasons: [], loadedAt: NOW,
  };
}
