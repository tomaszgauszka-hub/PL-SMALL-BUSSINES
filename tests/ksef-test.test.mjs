import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {applicationDatabase,asUser,alice,bob} from './helpers/database.mjs';
let db,workspace;
before(async()=>{db=await applicationDatabase();workspace=crypto.randomUUID();await db.query("insert into public.mk_ksef_test_workspaces(id,owner,test_nip,test_pesel) values($1,$2,'7980332920','30112206276')",[workspace,alice]);});
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
