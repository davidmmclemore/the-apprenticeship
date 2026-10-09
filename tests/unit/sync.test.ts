import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DeviceStore, eraseDeviceData } from "../../src/lib/local/device-store";
import { SyncEngine, RemoteError, type EntryRemote } from "../../src/lib/local/sync";
import type { Entry } from "../../src/lib/types";
import { SEASON_ID, USER_ID, NOW } from "../fixture";

function entry(id: string, title="Account version", revision=1): Entry {
  return {id,owner_id:USER_ID,apprenticeship_id:SEASON_ID,work_id:null,session_id:null,edition_id:null,kind:"reflection",title,body_html:null,quote_text:null,quote_locator:null,quote_source:null,provenance:"mine",provenance_note:null,question_status:null,prompt:null,keep_for_guide:false,favorite:false,revision,captured_at:NOW,archived_at:null,created_at:NOW,updated_at:NOW};
}
function remote(overrides: Partial<EntryRemote> = {}): EntryRemote {
  return {insert: async(row)=>entry(row.id,row.title ?? ""),fetch:async(id)=>entry(id),updateIfRevision:async(id)=>entry(id),attachThemes:async()=>{},...overrides};
}
test("accounts cannot see each other's cached data, drafts or pending notes", async()=>{
  const a=await DeviceStore.open(USER_ID), b=await DeviceStore.open("00000000-0000-4000-8000-00000000000b");
  try {await a.putDraft("capture",{secret:"a"});await a.putCache("shelf",{private:"a"});await new SyncEngine(a,remote()).enqueueCreate(SEASON_ID,{title:"a"});assert.equal(await b.getDraft("capture"),undefined);assert.equal(await b.getCache("shelf"),undefined);assert.deepEqual(await b.allOutbox(),[]);} finally {a.close();b.close();await eraseDeviceData(USER_ID);await eraseDeviceData(b.userId);}
});
test("lost insert reply retries the same id without creating a duplicate", async()=>{
 const store=await DeviceStore.open(USER_ID);let attempts=0;const ids:string[]=[];
 try {const engine=new SyncEngine(store,remote({insert:async(row)=>{ids.push(row.id);attempts++;throw attempts===1?new RemoteError("lost reply",null,true):new RemoteError("duplicate","23505",false);}}));const item=await engine.enqueueCreate(SEASON_ID,{title:"Mine"});await engine.sync();assert.equal((await store.getOutbox(item.id))?.status,"pending");await engine.sync();assert.deepEqual(ids,[item.id,item.id]);assert.deepEqual(await store.allOutbox(),[]);}finally{store.close();await eraseDeviceData(USER_ID);}
});
test("revision conflict keeps both versions and can save mine as a new note", async()=>{
 const store=await DeviceStore.open(USER_ID);const inserted:Partial<Entry>[]=[];const id=crypto.randomUUID();
 try {const engine=new SyncEngine(store,remote({updateIfRevision:async()=>null,fetch:async()=>entry(id,"Changed elsewhere",2),insert:async(row)=>{inserted.push(row);return entry(row.id,row.title ?? "");}}));await engine.enqueueUpdate(entry(id),{title:"My version"});await engine.sync();const conflict=await store.getOutbox(id);assert.equal(conflict?.status,"conflict");assert.equal(conflict?.serverVersion?.title,"Changed elsewhere");assert.equal(conflict?.payload.title,"My version");await engine.resolveConflict(id,"both");assert.equal(inserted[0].title,"My version");assert.notEqual(inserted[0].id,id);assert.deepEqual(await store.allOutbox(),[]);}finally{store.close();await eraseDeviceData(USER_ID);}
});
test("permanent remote rejection stays visible as failed", async()=>{
 const store=await DeviceStore.open(USER_ID);
 try{const engine=new SyncEngine(store,remote({insert:async()=>{throw new RemoteError("denied","42501",false);}}));const i=await engine.enqueueCreate(SEASON_ID,{title:"Mine"});await engine.sync();assert.equal((await store.getOutbox(i.id))?.status,"failed");}finally{store.close();await eraseDeviceData(USER_ID);}
});
test("deleted season cache is no longer available offline",async()=>{const s=await DeviceStore.open(USER_ID);try{await s.putCache(`season:${SEASON_ID}`,{});await s.deleteCache(`season:${SEASON_ID}`);assert.equal(await s.getCache(`season:${SEASON_ID}`),undefined);}finally{s.close();await eraseDeviceData(USER_ID);}});
