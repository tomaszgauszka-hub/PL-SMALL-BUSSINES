import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const alice="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",bob="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",id=()=>crypto.randomUUID();
let db;
before(async()=>{
 db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);insert into auth.users(id) values('${alice}'),('${bob}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(p text) returns text[] language sql immutable as $$select string_to_array(p,'/')$$;
 grant usage on schema auth,storage,public to authenticated,anon;`);
 await db.exec(readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
});
after(async()=>{await db?.close();});
test('CLI migration exactly matches the PostgreSQL schema under test',()=>{assert.equal(readFileSync(new URL('../supabase/migrations/20261016075550_initial_mala_ksiega.sql',import.meta.url),'utf8'),readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8'));});
async function as(owner){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);}
const client=(extra={})=>({id:id(),name:'Klient',nip:'',email:'',phone:'',address:'',notes:'',archived:0,version:0,...extra});
const sale=(extra={})=>({id:id(),clientId:'',date:'2026-10-01',issueDate:'2026-10-01',dueDate:'2026-10-15',amount:100000,description:'Usługa',category:'Usługi',number:'',kind:'sale',parentId:'',reason:'',b2b:0,ksefEligible:0,initialPayment:0,paymentDate:'2026-10-01',method:'Przelew',...extra});
async function write(action,data,op=id()){return(await db.query('select public.mk_mutate($1::uuid,$2,$3::jsonb) result',[op,action,JSON.stringify(data)])).rows[0].result;}
async function state(){return(await db.query('select public.mk_get_state() result')).rows[0].result;}
test('PostgreSQL migration enables RLS on every application table',async()=>{await db.exec('reset role');const {rows}=await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relname like 'mk_%'");assert.equal(rows.length,11);assert.ok(rows.every(r=>r.relrowsecurity));});
test('private clients and sales are isolated between two accounts',async()=>{await as(alice);const c=client();await write('client',c);await write('sale',sale({clientId:c.id,initialPayment:25000}));const a=await state();assert.equal(a.clients[0].name,'Klient');assert.ok(a.sales.some(s=>s.clientId===c.id));assert.ok(a.payments.some(p=>p.amount===25000));await as(bob);const b=await state();assert.equal(b.clients.length,0);assert.equal(b.sales.length,0);assert.equal(b.audit.length,0);await assert.rejects(write('sale',sale({clientId:c.id})),/własnego klienta/);});
test('RLS WITH CHECK prevents claiming or reassigning another owner',async()=>{await as(bob);await assert.rejects(db.query('insert into public.mk_clients(id,owner,name) values($1,$2,$3)',[id(),alice,'Atak']),/row-level security/);const c=client();await write('client',c);await assert.rejects(db.query('update public.mk_clients set owner=$1 where id=$2',[alice,c.id]),/row-level security/);});
test('composite foreign keys reject payments linked to the other account',async()=>{await as(alice);const s=sale();await write('sale',s);await as(bob);await assert.rejects(write('payment',{id:id(),saleId:s.id,date:s.date,amount:100,method:'Przelew',note:''}),/foreign key/);});
test('a sale, initial payment, audit and operation are atomic and idempotent',async()=>{await as(alice);const s=sale({description:'Idempotencja',initialPayment:30000}),op=id();const initial=await state();assert.deepEqual(await write('sale',s,op),{duplicate:false});assert.deepEqual(await write('sale',s,op),{duplicate:true});const result=await state();assert.equal(result.sales.length,initial.sales.length+1);assert.equal(result.payments.length,initial.payments.length+1);assert.equal(result.audit.length,initial.audit.length+1);await assert.rejects(write('sale',{...s,amount:200000},op),/Konflikt operacji/);});
test('duplicate document rollback preserves sequence, payments and audit',async()=>{await as(alice);const s=sale({number:'UNIQUE-TEST'});await write('sale',s);const before=await state();const counter=(await db.query('select value from public.mk_counters where owner=$1 and year=2026',[alice])).rows[0].value;await assert.rejects(write('sale',sale({number:s.number,initialPayment:999})),/unique constraint/);const after=await state();assert.equal(after.sales.length,before.sales.length);assert.equal(after.payments.length,before.payments.length);assert.equal(after.audit.length,before.audit.length);assert.equal((await db.query('select value from public.mk_counters where owner=$1 and year=2026',[alice])).rows[0].value,counter);});
test('optimistic version detects stale edits; snapshot preserves issued client data',async()=>{await as(alice);const c=client({name:'Przed zmianą'});await write('client',c);const s=sale({clientId:c.id});await write('sale',s);await write('client',{...c,name:'Po zmianie',version:1,archived:1});await assert.rejects(write('client',{...c,name:'Stare urządzenie',version:1}),/innym urządzeniu/);const result=await state();assert.equal(JSON.parse(result.sales.find(r=>r.id===s.id).snapshot).client.name,'Przed zmianą');assert.equal(result.clients.find(r=>r.id===c.id).name,'Po zmianie');});
test('Postgres validates fractional money, cost evidence and cost share',async()=>{await as(alice);await assert.rejects(write('sale',sale({amount:10.5})),/całkowitą/);const e={id:id(),date:'2026-01-01',paidDate:'2026-01-03',amount:50000,deductible:50000,description:'Materiały',category:'Materiały',evidence:'',notes:''};await assert.rejects(write('expense',e),/check constraint/);await assert.rejects(write('expense',{...e,evidence:'FV',deductible:50001}),/check constraint/);await write('expense',{...e,evidence:'FV'});});
test('a real breach persists after a return and across quarters',async()=>{await as(bob);const s=sale({amount:1081351,date:'2026-03-01'});await write('sale',s);await write('sale',sale({kind:'correction',parentId:s.id,date:'2026-03-02',amount:-1081351,reason:'Zwrot'}));const result=await state();assert.equal(result.legalEvents.find(e=>e.kind==='dn_breach').date,'2026-03-01');});
test('private Storage bucket rejects cross-account paths and reads',async()=>{await as(alice);const key=alice+'/'+id();await db.query("insert into storage.objects(bucket_id,name) values('mk-evidence',$1)",[key]);await as(bob);assert.equal((await db.query('select * from storage.objects where name=$1',[key])).rows.length,0);await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('mk-evidence',$1)",[alice+'/'+id()]),/row-level security/);});
test('shared-project Storage policy cannot leak evidence and preserves other buckets',async()=>{
 await db.exec("reset role;create policy other_app_read on storage.objects for select to authenticated using(true);create policy other_app_insert on storage.objects for insert to authenticated with check(true)");
 try {
  await as(alice);const key=alice+'/'+id();await db.query("insert into storage.objects(bucket_id,name) values('mk-evidence',$1)",[key]);
  await as(bob);assert.equal((await db.query('select * from storage.objects where name=$1',[key])).rows.length,0);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('mk-evidence',$1)",[alice+'/'+id()]),/row-level security/);
  await db.query("insert into storage.objects(bucket_id,name) values('taskon-existing-bucket','taskon-object')");
  assert.equal((await db.query("select * from storage.objects where bucket_id='taskon-existing-bucket'")).rows.length,1);
 } finally { await db.exec("reset role;drop policy other_app_read on storage.objects;drop policy other_app_insert on storage.objects"); }
});
test('unauthenticated role cannot call RPC or read data',async()=>{await db.exec('reset role;set role anon');await db.query("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(db.query('select * from public.mk_clients'),/permission denied/);await assert.rejects(db.query('select public.mk_get_state()'),/permission denied/);});
test('backup import skips duplicates and advances restored document numbering',async()=>{await as(alice);const s=sale({number:'E/2026/100'});const backup={format:'mala-ksiega-1',clients:[],sales:[s],payments:[],expenses:[]};await write('import',backup);await write('import',backup);const next=sale();await write('sale',next);const result=await state();assert.equal(result.sales.filter(r=>r.id===s.id).length,1);assert.equal(result.sales.find(r=>r.id===next.id).number,'E/2026/101');});
test('seller profile and tax inputs retain their version and camelCase response',async()=>{await as(alice);await write('settings',{sellerName:'Pracownia',sellerAddress:'Kraków',sellerNip:'',sellerEmail:'',startDate:'2026-01-01',eligible60:true,regulated:false,specialVat:false,specialCash:false,version:0});await write('tax',{year:2026,otherIncome:6000000,deductions:100000,advances:300000,taxRelief:0,version:0});const r=await state();assert.equal(r.settings.version,1);assert.equal(r.settings.sellerName,'Pracownia');assert.equal(r.tax[0].otherIncome,6000000);assert.equal(r.tax[0].version,1);});
test('import retains historical document snapshots and existing seller settings',async()=>{
 await as(alice);
 const snapshot=JSON.stringify({seller:{sellerName:'Dawna nazwa'},client:{name:'Dawny klient'},parentNumber:''});
 const s=sale({snapshot,createdAt:'2026-01-01T12:00:00.000Z'});
 await write('import',{format:'mala-ksiega-1',clients:[],sales:[s],payments:[],expenses:[],settings:{sellerName:'Z kopii',version:0}});
 const result=await state(),restored=result.sales.find(r=>r.id===s.id);
 assert.equal(JSON.parse(restored.snapshot).seller.sellerName,'Dawna nazwa');
 assert.equal(new Date(restored.createdAt).toISOString(),s.createdAt);
 assert.equal(result.settings.sellerName,'Pracownia');
});
test('import restores tax context and a historical breach without replacing newer records',async()=>{
 await as(bob);
 const backup={format:'mala-ksiega-1',clients:[],sales:[],payments:[],expenses:[],settings:{sellerName:'Profil z kopii',version:0},tax:[{year:2026,otherIncome:123456,deductions:0,advances:0,taxRelief:0,version:4}],legalEvents:[{kind:'dn_breach',date:'2026-01-20',details:'{}'}]};
 await write('import',backup);await write('import',backup);
 const r=await state();
 assert.equal(r.settings.sellerName,'Profil z kopii');
 assert.equal(r.tax[0].otherIncome,123456);
 assert.equal(r.legalEvents.find(e=>e.kind==='dn_breach').date,'2026-01-20');
 await assert.rejects(write('import',{format:'mala-ksiega-1'}),/Nieprawidłowa kopia/);
});
