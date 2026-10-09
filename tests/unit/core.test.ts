import { test } from "node:test";
import assert from "node:assert/strict";
import { publicationOrder, scopeProgress, nextSuggestedStep, shiftRemainingTargets, moveItem } from "../../src/lib/route";
import { buildImportPreview, readImportFile } from "../../src/lib/importer";
import { parseCsv } from "../../src/lib/csv";
import { assembleGuide, guideToMarkdown, seasonToJson, EXPORT_FORMAT } from "../../src/lib/export";
import { textToHtml, sanitizeHtml } from "../../src/lib/sanitize";
import { bundle, WORK_ID, NOW, SEASON_ID } from "../fixture";
import type { RouteStep } from "../../src/lib/types";

test("publication order keeps unknown dates separate and does not mutate inputs", () => {
  const works = [{id:"a",title:"Later",original_year:1950},{id:"b",title:"Unknown",original_year:null},{id:"c",title:"Earlier",original_year:1900}];
  assert.deepEqual(publicationOrder(works).known.map(w=>w.id), ["c","a"]);
  assert.equal(publicationOrder(works).unknown[0].id,"b"); assert.equal(works[0].id,"a");
});
test("rereading counts each work once against selected scope", () => {
  const progress = scopeProgress([{work_id:"a",scope:"essential"},{work_id:"b",scope:"optional"},{work_id:"c",scope:"outside"}], [{work_id:"a",status:"finished"},{work_id:"a",status:"finished"},{work_id:"c",status:"finished"}]);
  assert.deepEqual(progress, {essential:{total:1,finished:1},optional:{total:1,finished:0},outside:1,finishedOutside:1});
});
const steps: RouteStep[] = ["a","b","c","d"].map((work_id,position)=>({id:work_id,apprenticeship_id:SEASON_ID,work_id,section_id:null,position,rationale:null,target_month:"2026-12-01",origin:"mine",created_at:NOW}));
test("next step skips finished, current, and outside works", () => assert.equal(nextSuggestedStep(steps,[{work_id:"a",status:"finished"},{work_id:"b",status:"reading"}],new Map([["c","outside"]]))?.work_id,"d"));
test("shifting targets preserves finished dates across year boundaries", () => assert.deepEqual(shiftRemainingTargets(steps,[{work_id:"a",status:"finished"}],2).map(x=>x.target_month),Array(3).fill("2027-02-01")));
test("reordering clamps the destination without changing original list", () => {const a=[1,2,3];assert.deepEqual(moveItem(a,0,99),[2,3,1]);assert.deepEqual(a,[1,2,3]);});
test("CSV handles commas, escaped quotes, and multiline fields", () => assert.deepEqual(parseCsv('title,notes\r\n"A, B","He said ""hello""\nagain"'),[["title","notes"],["A, B",'He said "hello"\nagain']]));
test("import matches existing normalized titles without overwriting", () => {const rows=buildImportPreview(readImportFile('[{"title":"The Abolition of Man"}]',"works.json"),{works:bundle().works,editions:[]});assert.equal(rows[0].matchWorkId,WORK_ID);assert.equal(rows[0].action,"skip");});
test("import reports missing titles", () => assert.ok(buildImportPreview([{publisher:"House"}],{works:[],editions:[]})[0].errors.length));
test("JSON import rejects an unsupported object", () => assert.throws(()=>readImportFile('{"notes":[]}',"works.json")));
test("guide includes purpose and favorite rationale", () => {const md=guideToMarkdown(bundle());assert.match(md,/Learn to attend/);assert.match(md,/Worth returning to/);});
test("unread works are not described as finished in the guide", () => assert.equal(assembleGuide(bundle()).worksRead.length,0));
test("structured export preserves format and completion snapshots", () => {const b=bundle();const result=seasonToJson(b);assert.equal(result.format,EXPORT_FORMAT);assert.deepEqual(result.apprenticeship,b.season);assert.deepEqual(result.season_snapshots,b.snapshots);});
test("plain text cannot inject markup", () => assert.equal(textToHtml('<img src=x onerror=alert(1)>'),'<p>&lt;img src=x onerror=alert(1)&gt;</p>'));
test("server sanitizer falls back to escaped text", () => {const clean=sanitizeHtml('<p onclick="bad()">Safe</p><img src=x onerror="bad()">');assert.doesNotMatch(clean,/onclick|onerror|<img/);assert.match(clean,/Safe/);});

test("auth return destinations stay on this app", async () => {
  const { safeNext } = await import("../../src/lib/safe-next");
  for (const input of [null, "https://evil.example", "//evil.example", "/\\evil.example", "/\nevil.example"]) assert.equal(safeNext(input), "/");
  assert.equal(safeNext(`/season?id=${SEASON_ID}&tab=inheritance`), `/season?id=${SEASON_ID}&tab=inheritance`);
});
