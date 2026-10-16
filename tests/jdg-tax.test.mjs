import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { calculateInvoice } from '../lib/business.ts';
import { defaultBusinessProfile } from '../lib/business.ts';
import { emptyState } from '../lib/domain.ts';
import { calculateJdgTaxes, defaultJdgMonth, defaultJdgYear, emptyJdgTaxState, jdgMonthInput, jdgYearInput, lumpSumTax, taxPaymentDeadline, vatExemptionLimit, lumpSumEligibilityLimit } from '../lib/jdg-tax.ts';
import { applicationDatabase, asUser, alice, bob } from './helpers/database.mjs';
const profile={...defaultBusinessProfile('jdg'),configured:true,jdgStartDate:'2026-01-01',vatStatus:'active',vatStartDate:'2026-01-01'};
const config=(extra={})=>({...defaultJdgYear(2026,profile),...extra});
const entry=(month,price,extra={})=>{
 const date=`2026-${String(month).padStart(2,'0')}-01`,lines=[{name:'Pozycja',unit:'szt.',quantityMilli:1000,unitPrice:price,vatRate:'23',lumpSumRate:850,discountBps:0,productId:''}],totals=calculateInvoice(lines);
 return {id:crypto.randomUUID(),status:'issued',direction:'sale',kind:'regular',taxDate:date,vatDate:date,saleDate:date,lines,...totals,deductibleVat:0,pitCost:0,vatLimitIncluded:true,...extra};
};
const report=(documents,settings={},months=[],legacy=emptyState())=>calculateJdgTaxes({documents,payments:[],attachments:[]},{years:[],months},config(settings),legacy);
test('JDG tax dates are accrual dates, independent of payments and draft documents',()=>{
 const sales=[entry(1,4000000),entry(2,9999999,{status:'draft'})];const r=report(sales);
 assert.equal(r.rows[0].income,4000000);assert.equal(r.rows[0].pitDue,120000);assert.equal(r.rows[1].income,0);assert.equal(r.rows[1].pitDue,0);
});
test('scale advances deduct previously required advances, without billing arrears twice',()=>{
 const docs=[entry(1,10000000),entry(2,10000000),entry(3,15000000,{direction:'purchase',pitCost:15000000})];
 const r=report(docs),paid=report(docs,{},[{...defaultJdgMonth(2026,1),pitPaid:840000}]);
 assert.equal(r.rows[0].pitDue,840000);assert.equal(r.rows[1].pitDue,2800000);assert.equal(paid.rows[1].pitDue,2800000);
 assert.equal(r.rows[2].pitDue,0);assert.equal(r.primaryTax,240000);assert.equal(r.primaryPaid,0);
});
test('annual scale shares one allowance and never offsets salary with a DN or JDG loss',()=>{
 const dn=emptyState();dn.payments=[{date:'2026-02-01',amount:1000000}];
 let r=report([entry(1,1000000)],{otherIncome:4000000},[],dn);assert.equal(r.primaryTax,360000);
 dn.expenses=[{paidDate:'2026-02-01',amount:2000000,deductible:2000000}];
 r=report([entry(1,2000000,{direction:'purchase',pitCost:2000000})],{otherIncome:4000000},[],dn);assert.equal(r.primaryTax,120000);
});
test('linear health deduction applies 2026 cap and cannot deduct health costs twice',()=>{
 const paid={...defaultJdgMonth(2026,1),healthPaid:2000000};
 const r=report([entry(1,10000000)],{taxForm:'linear'},[paid]);assert.equal(r.healthAllowed,1410000);assert.equal(r.primaryTax,1632100);
 const withCosts=report([entry(1,10000000),entry(1,500000,{direction:'purchase',pitCost:500000})],{taxForm:'linear'},[{...paid,healthInCosts:500000}]);
 assert.equal(withCosts.healthAllowed,910000);assert.equal(withCosts.primaryTax,r.primaryTax);
 const invalid=report([entry(1,10000000)],{taxForm:'linear'},[{...paid,healthInCosts:1500000}]);assert.equal(invalid.annualValid,false);assert.equal(invalid.rows[0].pitDue,null);
});
test('linear or lump sum payments never offset the separate scale tax',()=>{
 const r=report([entry(1,1000000)],{taxForm:'linear',otherIncome:4000000,otherAdvances:100000},[{...defaultJdgMonth(2026,1),pitPaid:300000}]);
 assert.equal(r.primaryTax,190000);assert.equal(r.primaryBalance,-110000);assert.equal(r.secondaryTax,120000);assert.equal(r.secondaryBalance,20000);
});
test('lump sum allocates deductions proportionally and keeps half-grosz precision',()=>{
 const r=lumpSumTax(new Map([[850,1000000],[1200,1000000]]),100000);assert.equal(r.tax,194800);assert.deepEqual(r.buckets.map(b=>b.deduction),[50000,50000]);
 assert.equal(lumpSumTax(new Map([[850,10050]]),100.5).buckets[0].base,9900);
});
test('lump sum uses monthly income, half of paid health and carries unused deductions',()=>{
 const r=report([entry(2,1000000)],{taxForm:'lump_sum'},[{...defaultJdgMonth(2026,1),healthPaid:100000,socialDeduction:50000}]);
 assert.equal(r.rows[0].pitDue,0);assert.equal(r.rows[1].pitDue,76500);assert.equal(r.primaryTax,76500);
 const negative=report([entry(2,100000,{net:-100000,vat:-23000,gross:-123000,lines:[{...entry(2,100000).lines[0],quantityMilli:-1000}]})],{taxForm:'lump_sum'});
 assert.equal(negative.rows[1].pitDue,null);assert.equal(negative.annualValid,false);
});
test('lump sum eligibility is based on previous year, not this year turnover',()=>{
 assert.equal(lumpSumEligibilityLimit(2026),851720000);assert.equal(lumpSumEligibilityLimit(2025),856920000);
 const invalid=report([],{taxForm:'lump_sum',previousYearRevenue:851720001});assert.equal(invalid.annualValid,false);assert.equal(invalid.rows[0].pitDue,null);
 const valid=report([entry(1,900000000)],{taxForm:'lump_sum',previousYearRevenue:0});assert.equal(valid.annualValid,true);
});
test('VAT groups are rounded once per rate and purchase claim follows its VAT date',()=>{
 const a=entry(1,10174);assert.equal(a.vat,2340);
 const purchase=entry(1,10000,{direction:'purchase',deductibleVat:2300,vatDate:'2026-02-01'}),r=report([a,{...a,id:crypto.randomUUID()},purchase]);
 assert.equal(r.rows[0].vatDeclaredOutput,4700);assert.equal(r.rows[0].vatDeclaredInput,0);assert.equal(r.rows[1].vatDeclaredInput,2300);
});
test('VAT credit carries forward and requested refunds are removed from the carry only once',()=>{
 const purchase=entry(1,20000,{direction:'purchase',deductibleVat:4600}),sales=[entry(1,10000),entry(2,20000)];
 const r=report([purchase,...sales]);assert.equal(r.rows[0].vatCredit,2300);assert.equal(r.rows[1].vatDue,2300);
 const refunded=report([purchase,...sales],{},[{...defaultJdgMonth(2026,1),vatRefundRequested:1000}]);assert.equal(refunded.rows[0].vatCredit,1300);assert.equal(refunded.rows[1].vatDue,3300);
 const over=report([purchase,...sales],{},[{...defaultJdgMonth(2026,1),vatRefundRequested:5000}]);assert.equal(over.rows[0].vatCredit,0);assert.ok(over.rows[0].issues.length);
});
test('VAT proportion counts inclusive days and DN history does not reset the limit',()=>{
 assert.equal(vatExemptionLimit(2026,'2026-01-01'),24000000);assert.equal(vatExemptionLimit(2026,'2026-12-31'),Math.floor(24000000/365));assert.equal(vatExemptionLimit(2026,'2010-01-01'),24000000);assert.equal(vatExemptionLimit(2025,'2025-01-01'),20000000);
 const dn=emptyState();dn.sales=[{date:'2026-02-01',amount:500000}];const r=report([entry(10,1000000),entry(10,100000,{vatLimitIncluded:false})],{activityStartDate:'2025-01-01'},[],dn);
 assert.equal(r.vatSales,1500000);assert.equal(r.vatLimit,24000000);
});
test('tax payment dates move over weekends and Polish holidays across years',()=>{
 assert.equal(taxPaymentDeadline(2026,8,'pit'),'2026-09-21');assert.equal(taxPaymentDeadline(2026,11,'vat'),'2026-12-28');assert.equal(taxPaymentDeadline(2026,12,'pit'),'2027-01-20');assert.equal(taxPaymentDeadline(2026,12,'vat'),'2027-01-25');
});
test('tax input rejects partial zloty VAT carries and duplicate health deduction',()=>{
 assert.equal(jdgYearInput.safeParse(config({vatOpeningCredit:1})).success,false);assert.equal(jdgYearInput.safeParse(config({activityStartDate:'2012-01-01'})).success,true);
 assert.equal(jdgMonthInput.safeParse({...defaultJdgMonth(2026,1),healthPaid:100,healthInCosts:101}).success,false);
});
let db;
before(async()=>{db=await applicationDatabase();await asUser(db,alice);await rpc('mk_business_mutate','register',{businessType:'jdg'});await rpc('mk_business_mutate','profile',{businessType:'jdg',jdgStartDate:'2012-01-01',taxForm:'linear',vatStatus:'active',vatStartDate:'2012-01-01',exemptionBasis:'',confirmTransition:false,version:1});});
after(async()=>{await db?.close();});
async function rpc(name,action,data,op=crypto.randomUUID()){return(await db.query('select public.'+name+'($1::uuid,$2,$3::jsonb) result',[op,action,JSON.stringify(data)])).rows[0].result;}
async function state(){return(await db.query('select public.mk_jdg_tax_state() result')).rows[0].result;}
test('historical JDG registration, tax settings and contributions persist with versioned idempotency',async()=>{
 await asUser(db,alice);const op=crypto.randomUUID();await rpc('mk_jdg_tax_mutate','year',config(),op);assert.deepEqual(await rpc('mk_jdg_tax_mutate','year',config(),op),{duplicate:true});assert.equal((await state()).years[0].version,1);
 await assert.rejects(rpc('mk_jdg_tax_mutate','year',config()),/innym urządzeniu/);
 const month={...defaultJdgMonth(2026,1),healthPaid:10000,socialDeduction:50000};await rpc('mk_jdg_tax_mutate','month',month);assert.equal((await state()).months[0].socialDeduction,50000);
 await assert.rejects(rpc('mk_jdg_tax_mutate','month',month),/innym urządzeniu/);
});
test('JDG tax configuration remains private and anonymous RPC is denied',async()=>{
 await asUser(db,bob);assert.equal((await state()).months.length,0);assert.equal((await state()).years.length,0);await assert.rejects(rpc('mk_jdg_tax_mutate','year',config()),/konfigurację JDG/);
 await assert.rejects(db.query("insert into public.mk_jdg_months(owner,year,month) values($1,2026,2)",[alice]),/row-level security/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.mk_jdg_tax_state()'),/permission denied/);
});
