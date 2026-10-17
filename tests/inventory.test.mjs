import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {applicationDatabase,asUser,alice,bob} from './helpers/database.mjs';
import {activeInventories,inventoryEffect,inventoryImportOrder,inventoryInput,inventoryLineInput,inventoryLineValue,inventoryRestoreInput,inventoryTotal} from '../lib/inventory.ts';
import {defaultBusinessProfile,calculateInvoice} from '../lib/business.ts';
import {calculateJdgTaxes,defaultJdgYear,emptyJdgTaxState} from '../lib/jdg-tax.ts';
import {emptyState} from '../lib/domain.ts';
const id=()=>crypto.randomUUID();
const line=(extra={})=>({productId:'',name:'Towar',category:'goods',unit:'szt.',quantityMilli:1000,unitPrice:10000,method:'purchase',referencePrice:null,minimumUnitPrice:0,ownership:'own',ownerName:'',location:'',excludedValue:0,note:'',...extra});
const doc=(extra={})=>({id:id(),kind:'opening',date:'2026-01-01',status:'draft',replacesId:'',reason:'',location:'Magazyn',countedBy:'Jan Kowalski',notes:'',zeroConfirmed:false,lines:[line()],version:0,...extra});
const final=(extra={})=>({...doc(),status:'final',total:10000,version:1,createdAt:'2026-01-01T12:00:00Z',finalizedAt:'2026-01-01T12:00:00Z',...extra});
test('inventory valuation rounds fractions once and excludes third-party goods',()=>{
 assert.equal(inventoryLineValue(line({quantityMilli:1250,unitPrice:1999})).value,2499);
 assert.equal(inventoryTotal([line({quantityMilli:1,unitPrice:500}),line({excludedValue:100,note:'Art. 22p'})]),9901);
 assert.equal(inventoryLineValue(line({ownership:'third_party'})).value,0);
 assert.throws(()=>inventoryTotal([line({quantityMilli:1000000000,unitPrice:99999999999})]),/zakresem/);
});
test('inventory validation enforces lower valuation reason, WIP material floor and ownership',()=>{
 assert.equal(inventoryLineInput.safeParse(line({method:'market',unitPrice:5000,referencePrice:10000})).success,false);
 assert.equal(inventoryLineInput.safeParse(line({method:'market',unitPrice:5000,referencePrice:10000,note:'Uszkodzone opakowanie'})).success,true);
 assert.equal(inventoryLineInput.safeParse(line({category:'wip',method:'cost',minimumUnitPrice:11000})).success,false);
 assert.equal(inventoryLineInput.safeParse(line({category:'waste',method:'purchase'})).success,false);
 assert.equal(inventoryLineInput.safeParse(line({ownership:'third_party',unitPrice:0,method:'unvalued',ownerName:'Właściciel'})).success,true);
 assert.equal(inventoryLineInput.safeParse(line({excludedValue:10001,note:'Art. 22p'})).success,false);
});
test('inventory input handles invalid calendars, future drafts and explicit zero stocktakes',()=>{
 assert.equal(inventoryInput.safeParse(doc({kind:'interim',date:'bad'})).success,false);
 assert.equal(inventoryInput.safeParse(doc({kind:'interim',date:'2026-02-30'})).success,false);
 assert.equal(inventoryInput.safeParse(doc({kind:'interim',date:'2026-02-28'})).success,true);
 assert.equal(inventoryInput.safeParse(doc({kind:'closing',date:'2026-12-31'})).success,true);
 assert.equal(inventoryInput.safeParse(doc({kind:'closing',date:'2026-12-31',status:'final'})).success,false);
 assert.equal(inventoryInput.safeParse(doc({lines:[],status:'final'})).success,false);
 assert.equal(inventoryInput.safeParse(doc({lines:[],status:'final',zeroConfirmed:true})).success,true);
});
test('inventory corrections replace full snapshots without summing old versions',()=>{
 const opening=final(),old=final({kind:'interim',date:'2026-06-30',total:20000}),revision=final({kind:'interim',date:'2026-06-30',replacesId:old.id,total:25000});
 assert.equal(activeInventories([opening,old,revision]).length,2);
 assert.equal(inventoryEffect([opening,old,revision],2026,'2026-01-01',6).adjustment,15000);
 assert.equal(inventoryEffect([opening,old,revision],2026,'2026-01-01',7).adjustment,0);
 assert.equal(inventoryEffect([opening,old,revision],2026,'2026-01-01').complete,false);
 assert.equal(inventoryEffect([old],2026,'2026-01-01',6).valid,false);
});
test('previous closing may supply opening only for an already active JDG',()=>{
 const prior=final({kind:'closing',date:'2025-12-31',total:30000}),ending=final({kind:'closing',date:'2026-12-31',total:20000});
 assert.equal(inventoryEffect([prior,ending],2026,'2025-03-01').adjustment,-10000);
 assert.equal(inventoryEffect([prior,ending],2026,'2026-01-01').valid,false);
 assert.equal(inventoryEffect([prior,ending],2026).valid,false);
});
test('inventory import orders replacement history and detects missing parents',()=>{
 const parent=final(),child=final({replacesId:parent.id});
 assert.deepEqual(inventoryImportOrder([child,parent]).map(d=>d.id),[parent.id,child.id]);
 assert.deepEqual(inventoryImportOrder([child,parent],new Set([parent.id])).map(d=>d.id),[child.id]);
 assert.throws(()=>inventoryImportOrder([child]),/brakującą/);
 const input={document:doc({status:'final'}),snapshot:{total:999,createdAt:'2026-01-01T12:00:00Z',finalizedAt:''}};
 assert.equal(inventoryRestoreInput.safeParse(input).success,false);
});
const profile={...defaultBusinessProfile('jdg'),configured:true,jdgStartDate:'2026-01-01'};
const saleLines=[{name:'Usługa',unit:'szt.',quantityMilli:1000,unitPrice:10000000,vatRate:'23',lumpSumRate:850,discountBps:0,productId:''}];
const ledger={documents:[{id:id(),status:'issued',direction:'sale',taxDate:'2026-01-01',saleDate:'2026-01-01',vatDate:'2026-01-01',lines:saleLines,...calculateInvoice(saleLines),deductibleVat:0,pitCost:0}],payments:[],attachments:[]};
test('stocktakes adjust scale and linear income, only in the actual monthly/annual period',()=>{
 const inventories=[final({total:1000000}),final({kind:'interim',date:'2026-02-28',total:2000000}),final({kind:'closing',date:'2026-12-31',total:3000000})];
 const r=calculateJdgTaxes(ledger,emptyJdgTaxState(),defaultJdgYear(2026,profile),emptyState(),inventories,profile.jdgStartDate);
 assert.equal(r.taxProfit,12000000);assert.equal(r.rows[1].inventoryAdjustment,1000000);assert.equal(r.rows[1].pitDue,120000);assert.equal(r.rows[2].inventoryAdjustment,0);assert.equal(r.rows[2].pitDue,0);assert.equal(r.primaryTax,1080000);
 const linear=calculateJdgTaxes(ledger,emptyJdgTaxState(),{...defaultJdgYear(2026,profile),taxForm:'linear'},emptyState(),inventories,profile.jdgStartDate);
 assert.equal(linear.primaryTax,2280000);assert.equal(linear.rows[0].vatDue,r.rows[0].vatDue);
 const ryc=calculateJdgTaxes(ledger,emptyJdgTaxState(),{...defaultJdgYear(2026,profile),taxForm:'lump_sum'},emptyState(),inventories,profile.jdgStartDate);
 assert.equal(ryc.primaryTax,850000);assert.equal(ryc.taxProfit,10000000);
});
test('missing opening blocks affected PIT advances and closing calculation',()=>{
 const r=calculateJdgTaxes(ledger,emptyJdgTaxState(),defaultJdgYear(2026,profile),emptyState(),[final({kind:'interim',date:'2026-02-28'}),final({kind:'closing',date:'2026-12-31'})],profile.jdgStartDate);
 assert.equal(r.rows[0].pitDue,840000);assert.equal(r.rows[1].pitDue,null);assert.equal(r.rows[2].pitDue,null);assert.equal(r.annualValid,false);
});
let db,opening;
async function rpc(action,data,op=id()){return(await db.query('select public.mk_inventory_mutate($1::uuid,$2,$3::jsonb) result',[op,action,JSON.stringify(data)])).rows[0].result;}
async function call(name,action,data){return(await db.query('select public.'+name+'($1::uuid,$2,$3::jsonb) result',[id(),action,JSON.stringify(data)])).rows[0].result;}
async function state(){return(await db.query('select public.mk_inventory_state() result')).rows[0].result;}
before(async()=>{db=await applicationDatabase();for(const user of [alice,bob]){await asUser(db,user);await call('mk_business_mutate','register',{businessType:'jdg'});await call('mk_business_mutate','profile',{businessType:'jdg',jdgStartDate:'2025-01-01',taxForm:'scale',vatStatus:'active',vatStartDate:'2025-01-01',exemptionBasis:'',confirmTransition:false,version:1});await call('mk_mutate','settings',{sellerName:'Firma pierwotna',sellerAddress:'Kraków',sellerNip:'5260250995',version:0});}});
after(async()=>{await db?.close();});
test('explicit grants defeat permissive Supabase defaults for every Ewidora table',async()=>{
 await db.exec('reset role');
 const grants=(await db.query("select tablename,has_table_privilege('authenticated',quote_ident(schemaname)||'.'||quote_ident(tablename),'delete') as del,has_table_privilege('authenticated',quote_ident(schemaname)||'.'||quote_ident(tablename),'truncate') as trunc,has_table_privilege('anon',quote_ident(schemaname)||'.'||quote_ident(tablename),'select') as anonymous from pg_tables where schemaname='public' and tablename like 'mk_%'" )).rows;
 assert.equal(grants.length,23);assert.equal(grants.some(row=>row.del||row.trunc||row.anonymous),false);
 assert.equal((await db.query("select has_table_privilege('authenticated','public.mk_invoice_payments','update') as allowed")).rows[0].allowed,false);
 await asUser(db,alice);await assert.rejects(db.exec('truncate public.mk_inventories'),/permission denied/);
});
test('stocktake drafts persist with idempotency and reject stale versions',async()=>{
 await asUser(db,alice);const d=doc(),op=id();await rpc('save',d,op);assert.deepEqual(await rpc('save',d,op),{duplicate:true});opening=(await state()).documents.find(v=>v.id===d.id);assert.equal(opening.total,10000);
 await assert.rejects(rpc('save',d),/innym urządzeniu/);await assert.rejects(rpc('save',{...d,notes:'Inna treść'},op),/Konflikt/);
 await rpc('save',{...d,status:'final',version:1});opening=(await state()).documents.find(v=>v.id===d.id);assert.equal(opening.seller.name,'Firma pierwotna');assert.equal(opening.status,'final');assert.equal(inventoryRestoreInput.safeParse({document:opening,snapshot:{total:opening.total,seller:opening.seller,createdAt:opening.createdAt,finalizedAt:opening.finalizedAt}}).success,true);
 await assert.rejects(db.query("update public.mk_inventories set data=data||'{\"notes\":\"zmiana\"}' where id=$1",[d.id]),/niezmienny/);
});
test('inventory revisions retain seller identity and allow only one successor',async()=>{
 await asUser(db,alice);await call('mk_mutate','settings',{sellerName:'Firma nowa',sellerAddress:'Warszawa',sellerNip:'5260250995',version:1});
 const d=doc({status:'final',replacesId:opening.id,reason:'Ponowne przeliczenie',lines:[line({quantityMilli:2000})]});await rpc('save',d);
 const saved=(await state()).documents.find(v=>v.id===d.id);assert.equal(saved.total,20000);assert.equal(saved.seller.name,'Firma pierwotna');assert.equal(activeInventories((await state()).documents).find(v=>v.kind==='opening').id,d.id);
 await assert.rejects(rpc('save',doc({status:'final',replacesId:opening.id,reason:'Równoległa poprawka'})),/innym urządzeniu/);
 await assert.rejects(rpc('discard',{id:d.id,version:1}),/zatwierdzony/);
});
test('database stocktake guards dates, ownership, totals and zero confirmation',async()=>{
 await asUser(db,alice);await assert.rejects(rpc('save',doc({kind:'closing',date:'2026-12-31',status:'final'})),/Przyszły/);
 await assert.rejects(rpc('save',doc({date:'2026-02-01'})),/1 stycznia/);
 await assert.rejects(rpc('save',doc({kind:'interim',date:'2026-03-31',status:'final',lines:[]})),/zerowy/);
 await rpc('save',doc({kind:'interim',date:'2026-03-31',status:'final',lines:[],zeroConfirmed:true}));
 await assert.rejects(rpc('save',doc({lines:[line({ownership:'third_party'})]})),/Towary obce/);
 const d=doc({kind:'interim',date:'2026-04-30',status:'final',lines:[line({quantityMilli:1250,unitPrice:1999}),line({ownership:'third_party',method:'unvalued',unitPrice:0,ownerName:'Dostawca'})]});await rpc('save',d);assert.equal((await state()).documents.find(v=>v.id===d.id).total,2499);
});
test('backup restore retains immutable stocktake snapshots and revision history',async()=>{
 await asUser(db,bob);const saved={...opening,id:id(),version:0};const input={document:saved,snapshot:{total:saved.total,seller:saved.seller,createdAt:saved.createdAt,finalizedAt:saved.finalizedAt}};await rpc('restore',input);assert.deepEqual(await rpc('restore',input),{duplicate:true});
 const restored=(await state()).documents.find(d=>d.id===saved.id);assert.equal(restored.seller.name,'Firma pierwotna');assert.equal(restored.createdAt,saved.createdAt);
 await assert.rejects(rpc('restore',{document:doc({kind:'interim',date:'2026-05-31',status:'final'}),snapshot:{...input.snapshot,total:10001}}),/nie zgadza/);
});
test('discard is soft, versioned, immutable and stocktakes are isolated by RLS',async()=>{
 await asUser(db,bob);const d=doc({kind:'interim',date:'2026-06-30'});await rpc('save',d);await rpc('discard',{id:d.id,version:1});assert.equal((await state()).documents.find(v=>v.id===d.id).status,'void');await assert.rejects(rpc('save',{...d,version:2}),/zatwierdzony/);
 assert.equal((await state()).documents.some(v=>v.id===opening.id),false);
 await assert.rejects(rpc('save',doc({kind:'interim',date:'2026-07-31',replacesId:opening.id,reason:'Obcy spis'})),/własnego/);
 await assert.rejects(db.query('delete from public.mk_inventories where id=$1',[d.id]),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.mk_inventory_state()'),/permission denied/);
});
