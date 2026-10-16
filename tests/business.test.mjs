import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { calculateInvoice, calculateInvoiceLine } from "../lib/business.ts";
import { businessProfileInput, catalogItemInput } from "../lib/business-validation.ts";
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
 await db.exec(readFileSync(new URL('../supabase/migrations/20261016143642_business_profiles_and_catalog.sql',import.meta.url),'utf8'));
});
after(async()=>{await db?.close();});
async function as(owner){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);}
async function write(action,data,op=id()){return(await db.query('select public.mk_business_mutate($1::uuid,$2,$3::jsonb) result',[op,action,JSON.stringify(data)])).rows[0].result;}
async function state(){return(await db.query('select public.mk_business_state() result')).rows[0].result;}
const product=(extra={})=>({id:id(),name:'Projekt graficzny',kind:'service',sku:'USL-1',unit:'godz.',unitPrice:12345,vatRate:'23',lumpSumRate:1500,description:'Projekt',archived:false,version:0,...extra});
const profile=(extra={})=>({businessType:'jdg',jdgStartDate:'2026-10-15',taxForm:'scale',vatStatus:'exempt',vatStartDate:'',exemptionBasis:'art. 113',confirmTransition:true,version:1,...extra});
const line=(extra={})=>({name:'Usługa',unit:'godz.',quantityMilli:1000,unitPrice:10000,vatRate:'23',discountBps:0,lumpSumRate:850,productId:'',...extra});

test('invoice arithmetic handles fractional quantities, discounts and mixed VAT exactly',()=>{
 assert.deepEqual(calculateInvoiceLine(line({quantityMilli:1250,unitPrice:1999,discountBps:500})),{net:2374,vat:546,gross:2920});
 assert.deepEqual(calculateInvoice([line(),line({vatRate:'8'}),line({vatRate:'zw'})]),{net:30000,vat:3100,gross:33100});
 assert.deepEqual(calculateInvoiceLine(line({quantityMilli:-1000})),{net:-10000,vat:-2300,gross:-12300});
 assert.deepEqual(calculateInvoiceLine(line({unitPrice:1,quantityMilli:500,vatRate:'0'})),{net:1,vat:0,gross:1});
 assert.throws(()=>calculateInvoiceLine(line({quantityMilli:0})));
 assert.throws(()=>calculateInvoiceLine(line({unitPrice:99999999999,quantityMilli:1000000000})));
 assert.throws(()=>calculateInvoice([line({unitPrice:60000000000,vatRate:'0'}),line({unitPrice:60000000000,vatRate:'0'})]));
});
test('profile and catalog reject invalid dates, rates and DN tax modes',()=>{
 assert.equal(businessProfileInput.safeParse(profile()).success,true);
 assert.equal(businessProfileInput.safeParse(profile({jdgStartDate:'2026-02-30'})).success,false);
 assert.equal(businessProfileInput.safeParse(profile({businessType:'dn',taxForm:'linear'})).success,false);
 assert.equal(catalogItemInput.safeParse(product()).success,true);
 assert.equal(catalogItemInput.safeParse(product({vatRate:'22'})).success,false);
 assert.equal(catalogItemInput.safeParse(product({lumpSumRate:999})).success,false);
});
test('business type is persisted and a second registration never overwrites it',async()=>{
 await as(alice);await write('register',{businessType:'dn'});await write('register',{businessType:'jdg'});
 const p=(await state()).profile;assert.equal(p.businessType,'dn');assert.equal(p.initialType,'dn');assert.equal(p.configured,true);
 await as(bob);await write('register',{businessType:'jdg'});const b=(await state()).profile;assert.equal(b.businessType,'jdg');assert.equal(b.configured,false);
});
test('catalog persists exact money, is idempotent and detects concurrent changes',async()=>{
 await as(alice);const item=product(),op=id();await write('product',item,op);assert.deepEqual(await write('product',item,op),{duplicate:true});
 assert.equal((await state()).products.length,1);assert.equal((await state()).products[0].unitPrice,12345);
 await write('product',{...item,name:'Nowa nazwa',archived:true,version:1});
 await assert.rejects(write('product',{...item,version:1}),/innym urządzeniu/);
 const saved=(await state()).products[0];assert.equal(saved.name,'Nowa nazwa');assert.equal(saved.archived,true);assert.equal(saved.version,2);
});
test('catalog and business profiles remain isolated between accounts',async()=>{
 await as(bob);assert.equal((await state()).products.length,0);
 await assert.rejects(db.query('insert into public.mk_products(id,owner,name,kind,unit_price,vat_rate,lump_sum_rate) values($1,$2,$3,$4,$5,$6,$7)',[id(),alice,'Obcy','service',100,'23',850]),/row-level security/);
 assert.equal((await db.query('select * from public.mk_business_profiles where owner=$1',[alice])).rows.length,0);
});
test('DN to JDG preserves legacy rows and requires a nonconflicting, confirmed date',async()=>{
 await as(alice);
 await db.query("insert into public.mk_sales(id,owner,client_name,date,issue_date,due_date,amount,description,category,number,kind,snapshot) values($1,$2,'Klient','2026-10-01','2026-10-01','2026-10-01',10000,'Stara usługa','Usługi','E/2026/1','sale','{}')",[id(),alice]);
 await assert.rejects(write('profile',profile({confirmTransition:false})),/Potwierdź/);
 await assert.rejects(write('profile',profile({jdgStartDate:'2026-10-01'})),/istnieją wpisy DN/);
 await write('profile',profile());
 const result=await state();assert.equal(result.profile.businessType,'jdg');assert.equal(result.profile.initialType,'dn');assert.equal(result.events.length,1);assert.equal(result.events[0].effectiveDate,'2026-10-15');
 assert.equal((await db.query('select count(*)::int n from public.mk_sales where owner=$1',[alice])).rows[0].n,1);
 await assert.rejects(write('profile',profile({businessType:'dn',version:2})),/cofnąć JDG/);
 await assert.rejects(write('profile',profile({jdgStartDate:'2026-10-16',version:2})),/zmienić zapisanej daty/);
 await assert.rejects(db.query("insert into public.mk_sales(owner,client_name,date,issue_date,due_date,amount,description,category,number,kind,snapshot) values($1,'Klient','2026-10-16','2026-10-16','2026-10-16',10000,'Nowa usługa','Usługi','E/2026/2','sale','{}')",[alice]),/osobnej ewidencji faktur/);
});
test('new application tables have RLS and anonymous access is rejected',async()=>{
 await db.exec('reset role');const {rows}=await db.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in ('mk_business_profiles','mk_business_events','mk_products')");assert.equal(rows.length,3);assert.ok(rows.every(row=>row.relrowsecurity));
 await db.exec('set role anon');await assert.rejects(db.query('select public.mk_business_state()'),/permission denied/);
});
