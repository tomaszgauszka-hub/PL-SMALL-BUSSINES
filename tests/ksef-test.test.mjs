import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {applicationDatabase,asUser,alice,bob} from './helpers/database.mjs';
import {buildTestInvoice} from '../lib/ksef/fa3.ts';
import {sha256} from '../lib/ksef/test-client.ts';
let db,workspace;
before(async()=>{db=await applicationDatabase();workspace=crypto.randomUUID();await db.query("insert into public.mk_ksef_test_workspaces(id,owner,test_nip,test_pesel,status) values($1,$2,'7980332920','30112206276','person_created')",[workspace,alice]);});
after(async()=>{await db?.close();});
test('KSeF lab is owned by one account independently of its business profile',async()=>{
 await asUser(db,alice);const rows=(await db.query('select * from public.mk_ksef_test_workspaces')).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].id,workspace);assert.equal(rows[0].environment,'TEST');assert.equal(rows[0].business_type,'jdg');
 assert.equal((await db.query('select count(*)::int n from public.mk_business_profiles')).rows[0].n,0);
 await asUser(db,bob);assert.equal((await db.query('select * from public.mk_ksef_test_workspaces')).rows.length,0);
});
test('lab access cannot provision another identity or change endpoint and assignment',async()=>{
 await asUser(db,alice);
 await assert.rejects(db.query("update public.mk_ksef_test_workspaces set api_base_url='https://api.ksef.mf.gov.pl/v2' where id=$1",[workspace]),/permission denied/);
 await assert.rejects(db.query('update public.mk_ksef_test_workspaces set owner=$1 where id=$2',[bob,workspace]),/permission denied/);
 await assert.rejects(db.query("insert into public.mk_ksef_test_workspaces(owner,test_nip,test_pesel) values($1,'7980332920','30112206276')",[bob]),/permission denied/);
 await assert.rejects(db.query('delete from public.mk_ksef_test_workspaces where id=$1',[workspace]),/permission denied/);
 await assert.rejects(db.exec('truncate public.mk_ksef_test_workspaces'),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.mk_ksef_test_workspaces'),/permission denied/);
});
test('database rejects production/DEMO endpoints and non-JDG lab types even for provisioning',async()=>{
 await db.exec('reset role');
 for(const [column,value] of [['environment','DEMO'],['environment','PROD'],['api_base_url','https://api.ksef.mf.gov.pl/v2'],['api_base_url','https://api-demo.ksef.mf.gov.pl/v2'],['business_type','company']]) await assert.rejects(db.query('update public.mk_ksef_test_workspaces set '+column+'=$1 where id=$2',[value,workspace]),/check constraint/);
 assert.equal((await db.query('select environment from public.mk_ksef_test_workspaces where id=$1',[workspace])).rows[0].environment,'TEST');
});
async function newDocument(){
 await db.exec('reset role;delete from mk_private.ksef_test_runtime');await asUser(db,alice);
 const id=crypto.randomUUID(),prepared=buildTestInvoice(id,'7980332920',{synthetic:true,issueDate:'2026-10-17',lines:[{name:'Test',unit:'szt.',quantityMilli:1000,unitPrice:10000,vatRate:'23'}]},new Date().toISOString());
 const data={...prepared,invoiceHash:sha256(prepared.xml)};
 await db.query('select public.mk_ksef_test_create($1,$2)',[id,JSON.stringify(data)]);return{id,data};
}
async function claim(action,id=null){return(await db.query('select public.mk_ksef_test_claim($1,$2) result',[action,id])).rows[0].result;}
async function commit(lease,data,release=true){return db.query('select public.mk_ksef_test_commit($1,$2,$3)',[lease,JSON.stringify(data),release]);}
test('test documents are idempotent, owner-scoped, immutable through direct writes and separate from real ledgers',async()=>{
 const{id,data}=await newDocument();const duplicate=(await db.query('select public.mk_ksef_test_create($1,$2) result',[id,JSON.stringify(data)])).rows[0].result;
 assert.equal(duplicate.duplicate,true);
 assert.equal((await db.query('select count(*)::int n from public.mk_invoices')).rows[0].n,0);
 await assert.rejects(db.query('update public.mk_ksef_test_documents set gross=1 where id=$1',[id]),/permission denied/);
 await assert.rejects(db.query('delete from public.mk_ksef_test_documents where id=$1',[id]),/permission denied/);
 await assert.rejects(db.query('select * from mk_private.ksef_test_runtime'),/permission denied/);
 await asUser(db,bob);assert.equal((await db.query('select count(*)::int n from public.mk_ksef_test_documents')).rows[0].n,0);
 await assert.rejects(claim('send',id),/Brak przydzielonej/);
});
test('database serializes two devices and never returns a submitted document to a sendable state',async()=>{
 const{id}=await newDocument();const first=await claim('send',id);
 await assert.rejects(claim('send',id),/już trwa/);
 await commit(first.lease,{sessionReference:'20261017-SO-ABCDEF0000-1234567890-AA',status:'sending',phase:'submission_started'},false);
 await commit(first.lease,{status:'unknown',message:'Timeout'});
 await db.exec('reset role');await db.exec("update mk_private.ksef_test_runtime set last_started_at=now()-interval '11 seconds'");await asUser(db,alice);
 await assert.rejects(claim('send',id),/już skierowana/);
 const refresh=await claim('refresh',id);await assert.rejects(commit(refresh.lease,{status:'ready'}),/Nie można ponownie/);
 await asUser(db,bob);await assert.rejects(commit(refresh.lease,{status:'ready'}),/wygasła/);
});
test('accepted status requires MF confirmation, and the lease cannot be reused after release',async()=>{
 const{id}=await newDocument();const operation=await claim('send',id);
 await assert.rejects(commit(operation.lease,{status:'accepted',ksefNumber:'7980332920-20261017-ABCDEF123456-AB'}),/check constraint/);
 await commit(operation.lease,{status:'accepted',mfStatus:200,ksefNumber:'7980332920-20261017-ABCDEF123456-AB',sessionReference:'20261017-SO-ABCDEF0000-1234567890-AA',invoiceReference:'20261017-EE-ABCDEF0000-1234567890-AA'});
 await assert.rejects(commit(operation.lease,{status:'rejected'}),/wygasła/);
 await db.exec('reset role');await db.exec("update mk_private.ksef_test_runtime set last_started_at=now()-interval '11 seconds'");await asUser(db,alice);
 const read=await claim('refresh',id);await assert.rejects(commit(read.lease,{status:'rejected'}),/niezmienna/);
});
test('missing synthetic consent and null operations are rejected at the database boundary',async()=>{
 const{id,data}=await newDocument();const nextId=crypto.randomUUID();data.input={...data.input};delete data.input.synthetic;
 await assert.rejects(db.query('select public.mk_ksef_test_create($1,$2)',[nextId,JSON.stringify(data)]),/check constraint/);
 await assert.rejects(claim(null,id),/Nieobsługiwana/);
});
