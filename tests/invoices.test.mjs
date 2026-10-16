import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {applicationDatabase,asUser,alice,bob} from './helpers/database.mjs';
import {invoiceInput,invoiceSummary,parseQuantity} from '../lib/invoices.ts';
const id=()=>crypto.randomUUID();let db,issued;
const line=(extra={})=>({name:'Usługa',unit:'godz.',quantityMilli:1000,unitPrice:10000,vatRate:'23',discountBps:0,lumpSumRate:850,productId:'',...extra});
const invoice=(extra={})=>({id:id(),direction:'sale',status:'draft',kind:'regular',number:'',clientId:'',partyName:'Klient',partyAddress:'Kraków',partyNip:'',issueDate:'2026-10-01',saleDate:'2026-10-01',dueDate:'2026-10-15',taxDate:'2026-10-01',vatDate:'2026-10-01',receivedDate:'2026-10-01',lines:[line()],parentId:'',reason:'',notes:'',vatDeductionBps:10000,costDeductionBps:10000,costCategory:'other',exemptionBasis:'',paymentAccount:'',splitPayment:false,initialPayment:0,paymentDate:'2026-10-01',method:'Przelew',version:0,...extra});
async function rpc(name,action,data,op=id()){return(await db.query('select public.'+name+'($1::uuid,$2,$3::jsonb) result',[op,action,JSON.stringify(data)])).rows[0].result;}
async function state(){return(await db.query('select public.mk_invoice_state() result')).rows[0].result;}
before(async()=>{
 db=await applicationDatabase();
 for(const user of [alice,bob]) {
  await asUser(db,user);await rpc('mk_business_mutate','register',{businessType:'jdg'});
  await rpc('mk_business_mutate','profile',{businessType:'jdg',jdgStartDate:'2026-01-01',taxForm:'scale',vatStatus:'active',vatStartDate:'2026-01-01',exemptionBasis:'',confirmTransition:false,version:1});
  await rpc('mk_mutate','settings',{sellerName:'Firma przed zmianą',sellerAddress:'Kraków',sellerNip:'5260250995',sellerEmail:'',startDate:'2026-01-01',eligible60:false,regulated:false,specialVat:true,specialCash:false,version:0});
 }
});
after(async()=>{await db?.close();});
test('invoice input validates real dates and exact three-decimal quantities',()=>{
 assert.equal(invoiceInput.safeParse(invoice()).success,true);assert.equal(invoiceInput.safeParse(invoice({saleDate:'2026-02-30'})).success,false);
 assert.equal(invoiceInput.safeParse(invoice({kind:'correction'})).success,false);assert.equal(parseQuantity('1,125'),1125);assert.equal(parseQuantity('-0.125'),-125);
 assert.throws(()=>parseQuantity('1.0001'));assert.throws(()=>parseQuantity('0'));
});
test('draft edits are versioned and issue creates exact totals and a unique number',async()=>{
 await asUser(db,alice);const d=invoice();await rpc('mk_invoice_mutate','invoice',d);let saved=(await state()).documents.find(i=>i.id===d.id);
 assert.equal(saved.status,'draft');assert.equal(invoiceSummary([saved],[],2026,10).income,0);
 await rpc('mk_invoice_mutate','invoice',{...d,lines:[line({quantityMilli:1250,unitPrice:1999,discountBps:500})],version:1});
 await assert.rejects(rpc('mk_invoice_mutate','invoice',{...d,version:1}),/innym urządzeniu/);
 await rpc('mk_invoice_mutate','invoice',{...d,status:'issued',lines:[line({quantityMilli:1250,unitPrice:1999,discountBps:500})],version:2});
 issued=(await state()).documents.find(i=>i.id===d.id);assert.equal(issued.number,'FV/2026/1');assert.equal(issued.net,2374);assert.equal(issued.vat,546);assert.equal(issued.gross,2920);
 await assert.rejects(db.query("update public.mk_invoices set data=data||'{\"notes\":\"cicha zmiana\"}' where id=$1",[d.id]),/niezmienny/);
});
test('issuing and first payment are atomic and idempotent',async()=>{
 await asUser(db,alice);const d=invoice({status:'issued',initialPayment:5000}),op=id();await rpc('mk_invoice_mutate','invoice',d,op);assert.deepEqual(await rpc('mk_invoice_mutate','invoice',d,op),{duplicate:true});
 const result=await state();assert.equal(result.documents.filter(i=>i.id===d.id).length,1);assert.equal(result.payments.filter(p=>p.invoiceId===d.id).length,1);
 const before=result.documents.length;await assert.rejects(rpc('mk_invoice_mutate','invoice',invoice({status:'issued',initialPayment:999999})),/przekracza/);assert.equal((await state()).documents.length,before);
});
test('issued seller and line prices retain snapshots after settings change',async()=>{
 await asUser(db,alice);await rpc('mk_mutate','settings',{sellerName:'Firma po zmianie',sellerAddress:'Nowy adres',sellerNip:'5260250995',version:1});
 const saved=(await state()).documents.find(i=>i.id===issued.id);assert.equal(saved.seller.name,'Firma przed zmianą');assert.equal(saved.lines[0].unitPrice,1999);
});
test('purchase separates PIT cost, receipt date and deductible VAT',async()=>{
 await asUser(db,alice);const d=invoice({direction:'purchase',status:'issued',number:'ZAK/10/1',partyNip:'5260250995',taxDate:'2026-11-01',vatDate:'2026-12-01',vatDeductionBps:5000,costDeductionBps:8000});await rpc('mk_invoice_mutate','invoice',d);
 const saved=(await state()).documents.find(i=>i.id===d.id);assert.equal(saved.deductibleVat,1150);assert.equal(saved.pitCost,8920);
 assert.equal(invoiceSummary([saved],[],2026,11).cost,8920);assert.equal(invoiceSummary([saved],[],2026,11).purchaseVat,0);assert.equal(invoiceSummary([saved],[],2026,12).purchaseVat,1150);
 await assert.rejects(rpc('mk_invoice_mutate','invoice',invoice({direction:'purchase',status:'issued',number:'BAD-DATE',partyNip:'5260250995',vatDate:'2026-09-01'})),/poprzedzać otrzymania/);
});
test('payments cannot overpay and reversals preserve the immutable trail',async()=>{
 await asUser(db,alice);const payment={id:id(),invoiceId:issued.id,date:'2026-10-02',amount:1000,method:'Przelew',note:'Wpłata'};await rpc('mk_invoice_mutate','payment',payment);
 await assert.rejects(rpc('mk_invoice_mutate','payment',{...payment,id:id(),amount:99999}),/przekraczają/);
 await rpc('mk_invoice_mutate','reversePayment',{id:id(),paymentId:payment.id,date:'2026-10-03',note:'Błędna kwota'});
 const payments=(await state()).payments.filter(p=>p.invoiceId===issued.id);assert.equal(payments.length,2);assert.equal(payments.reduce((s,p)=>s+p.amount,0),0);
 await assert.rejects(rpc('mk_invoice_mutate','reversePayment',{id:id(),paymentId:payment.id,date:'2026-10-03',note:'Ponownie'}),/już odwrócony/);
});
test('corrections reference an issued owned source and retain old seller details',async()=>{
 await asUser(db,alice);const d=invoice({status:'issued',kind:'correction',parentId:issued.id,reason:'Częściowy zwrot',lines:[line({quantityMilli:-1000,unitPrice:1000})],initialPayment:500});await rpc('mk_invoice_mutate','invoice',d);
 const r=await state(),saved=r.documents.find(i=>i.id===d.id);assert.equal(saved.gross,-1230);assert.equal(saved.number,'FK/2026/1');assert.equal(saved.seller.name,'Firma przed zmianą');assert.equal(saved.source.number,issued.number);assert.equal(r.payments.find(p=>p.invoiceId===d.id).amount,-500);
});
test('cumulative corrections cannot reduce an invoice below zero',async()=>{
 await asUser(db,alice);await assert.rejects(rpc('mk_invoice_mutate','invoice',invoice({status:'issued',kind:'correction',parentId:issued.id,reason:'Za duży zwrot',lines:[line({quantityMilli:-1000,unitPrice:2000})]})),/poniżej zera/);
});
test('restoring invoices retains historical seller, exact costs and advances numbering',async()=>{
 await asUser(db,alice);const d=invoice({status:'issued',number:'FV/2026/50'}),snapshot={seller:{name:'Historyczna nazwa',address:'Dawny adres',nip:'5260250995'},deductibleVat:0,pitCost:0,createdAt:'2026-01-01T12:00:00Z',issuedAt:'2026-01-01T12:00:00Z'};
 await rpc('mk_invoice_mutate','restoreInvoice',{document:d,snapshot});await rpc('mk_invoice_mutate','restoreInvoice',{document:d,snapshot});
 const saved=(await state()).documents.filter(doc=>doc.id===d.id);assert.equal(saved.length,1);assert.equal(saved[0].seller.name,'Historyczna nazwa');assert.ok(saved[0].createdAt.startsWith('2026-01-01'));
 const next=invoice({status:'issued'});await rpc('mk_invoice_mutate','invoice',next);assert.equal((await state()).documents.find(doc=>doc.id===next.id).number,'FV/2026/51');
 const purchase=invoice({status:'issued',direction:'purchase',number:'ARCHIWUM/1',partyNip:'5260250995',vatDeductionBps:5000,costDeductionBps:8000});
 await rpc('mk_invoice_mutate','restoreInvoice',{document:purchase,snapshot:{...snapshot,deductibleVat:1150,pitCost:8920}});assert.equal((await state()).documents.find(doc=>doc.id===purchase.id).pitCost,8920);
 await assert.rejects(rpc('mk_invoice_mutate','restoreInvoice',{document:{...purchase,id:id(),number:'ARCHIWUM/2'},snapshot:{...snapshot,deductibleVat:1150,pitCost:9999}}),/Koszt PIT w kopii/);
});
test('restored payments and reversals are idempotent and retain the immutable trail',async()=>{
 await asUser(db,alice);const doc=invoice({status:'issued'});await rpc('mk_invoice_mutate','invoice',doc);
 const original={id:id(),invoiceId:doc.id,date:'2026-10-01',amount:500,method:'Przelew',note:'Archiwum',reversalOf:'',createdAt:'2026-10-01T12:00:00Z'};
 await rpc('mk_invoice_mutate','restorePayment',original);await rpc('mk_invoice_mutate','restorePayment',original);
 await rpc('mk_invoice_mutate','restorePayment',{...original,id:id(),amount:-500,reversalOf:original.id,createdAt:'2026-10-01T13:00:00Z'});
 const payments=(await state()).payments.filter(p=>p.invoiceId===doc.id);assert.equal(payments.length,2);assert.equal(payments.reduce((sum,p)=>sum+p.amount,0),0);
});
test('invoice state and client references are isolated between accounts',async()=>{
 await asUser(db,bob);assert.equal((await state()).documents.length,0);await assert.rejects(rpc('mk_invoice_mutate','invoice',invoice({status:'issued',kind:'correction',parentId:issued.id,reason:'Obcy',lines:[line({quantityMilli:-1000})]})),/własnej faktury/);
 assert.equal((await db.query('select * from public.mk_invoices where id=$1',[issued.id])).rows.length,0);
 await assert.rejects(db.query("insert into public.mk_invoice_payments(id,owner,invoice_id,date,amount,method) values($1,$2,$3,'2026-10-02',10,'Przelew')",[id(),alice,issued.id]),/własnej wystawionej|row-level security/);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.mk_invoice_state()'),/permission denied/);
});
