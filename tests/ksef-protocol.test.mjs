import 'reflect-metadata';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,webcrypto,privateDecrypt,constants} from 'node:crypto';
import * as x509 from '@peculiar/x509';
import * as xades from 'xadesjs';
import {buildTestInvoice,validateTestXml} from '../lib/ksef/fa3.ts';
import {testInvoiceInput} from '../lib/ksef/test-model.ts';
import {sha256,signedTestChallenge,encryptedTestInvoice,testRequest,KsefTestError,TEST_API} from '../lib/ksef/test-client.ts';
import {runTestOperation,verifyStoredTestInvoice} from '../lib/ksef/test-service.ts';
const nip='7980332920',session='20261017-SO-ABCDEF0000-1234567890-AA',reference='20261017-EE-ABCDEF0000-1234567890-AA',number=nip+'-20261017-ABCDEF123456-AB';
const sample=(rates=['23'])=>({synthetic:true,issueDate:'2026-10-17',lines:rates.map(rate=>({name:'Próba & <test>',unit:'szt.',quantityMilli:1250,unitPrice:999,vatRate:rate}))});
let certificate,keyPair;
before(async()=>{keyPair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);certificate=await x509.X509CertificateGenerator.createSelfSigned({serialNumber:'01',name:'CN=MF key TEST only',keys:keyPair,notBefore:new Date(Date.now()-10000),notAfter:new Date(Date.now()+86400000),signingAlgorithm:{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}});});
test('ordinary FA(3) supports each pilot VAT rate and mixed taxable rates with exact totals and escaping',async()=>{
 for(const rates of [['23'],['8'],['5'],['0'],['zw'],['23','8','5','0']]){
  const f=buildTestInvoice(randomUUID(),nip,sample(rates),new Date().toISOString());await validateTestXml(f.xml);
  assert.equal(f.net,1249*rates.length);assert.equal(f.gross,f.net+f.vat);assert.match(f.xml,/Próba &amp; &lt;test&gt;/);
  assert.match(f.xml,/Fikcyjny odbiorca TEST/);assert.notEqual(f.buyerNip,nip);
 }
});
test('offline validation rejects a damaged schema document and entity expansion',async()=>{
 const f=buildTestInvoice(randomUUID(),nip,sample(),new Date().toISOString());
 await assert.rejects(validateTestXml(f.xml.replace('<P_15>','<WRONG>')),/XML FA\(3\)/);
 await assert.rejects(validateTestXml('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><foo>&x;</foo>'),/Niedozwolona/);
 assert.equal(testInvoiceInput.safeParse({...sample(),synthetic:false}).success,false);
 assert.equal(testInvoiceInput.safeParse({...sample(),buyerNip:'1234567890'}).success,false);
});
test('generated XAdES verifies cryptographically and has an explicit whole-document reference',async()=>{
 const xml=await signedTestChallenge(nip,'20261017-CR-ABCDEF1234-ABCDEF1234-AA');
 assert.match(xml,/<ds:Reference URI=""/);assert.match(xml,/SigningCertificate/);assert.doesNotMatch(xml,/PRIVATE KEY/);
 const doc=xades.Parse(xml),s=new xades.SignedXml(doc);s.LoadXml(doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','Signature')[0]);assert.equal(await s.Verify(),true);
 const changed=xades.Parse(xml.replace('<Nip>'+nip+'</Nip>','<Nip>1234567890</Nip>')),v=new xades.SignedXml(changed);v.LoadXml(changed.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','Signature')[0]);
 try{assert.equal(await v.Verify(),false);}catch(e){assert.match(e.message,/digest|hash/i);}
});
function fixture(){const id=randomUUID(),f=buildTestInvoice(id,nip,sample(),new Date().toISOString());return{id,number:f.number,input:f.input,xml:f.xml,net:f.net,vat:f.vat,gross:f.gross,invoice_hash:sha256(f.xml),status:'ready',phase:'validated',session_reference:null,invoice_reference:null,ksef_number:null,mf_status:null,message:'',upo:null,upo_hash:null,closed_at:null};}
function harness(options={}){
 const doc=fixture(),calls=[],commits=[];let mfPosted=false;
 const store={claim:async(action)=>({lease:randomUUID(),workspace:{id:randomUUID(),test_nip:nip},document:structuredClone(doc)}),commit:async(lease,data,release)=>{
  if(options.failCheckpoint&&data.phase==='submission_started')throw Error('database unavailable');
  commits.push({data,release});for(const[key,value]of Object.entries(data)){const column={sessionReference:'session_reference',invoiceReference:'invoice_reference',ksefNumber:'ksef_number',mfStatus:'mf_status',upoHash:'upo_hash'}[key]||key;if(column==='closed'&&value)doc.closed_at=new Date().toISOString();else doc[column]=value;}
 }};
 const mf=()=>({invoiceHash:options.wrongHash?'wrong':doc.invoice_hash,invoiceNumber:doc.number,referenceNumber:reference,ksefNumber:number,status:{code:200,description:'Sukces'}});
 const connection={request:async(path,request={})=>{
  calls.push({path,method:request.method||'GET',body:request.body});
  if(path==='/security/public-key-certificates')return{data:[{certificate:certificate.toString('base64'),publicKeyId:'public-test-key',usage:['SymmetricKeyEncryption'],validFrom:new Date(Date.now()-10000).toISOString(),validTo:new Date(Date.now()+86400000).toISOString()}]};
  if(path==='/sessions/online')return{data:{referenceNumber:session}};
  if(path.endsWith('/close'))return{data:null};
  if(path.endsWith('/invoices')&&request.method==='POST'){mfPosted=true;if(options.timeout)throw new KsefTestError('Timeout after acceptance',504);return{data:{referenceNumber:reference}};}
  if(path.endsWith('/invoices?pageSize=10'))return{data:{invoices:mfPosted?[mf()]:[]}};
  if(path.endsWith('/upo')){const text='<UPO><NumerKSeF>'+number+'</NumerKSeF></UPO>';return{text,response:new Response(text,{headers:{'Content-Type':'application/xml','x-ms-meta-hash':options.badUpo?'invalid':sha256(text)}})};}
  if(path.endsWith('/'+reference))return{data:mf()};
  throw Error('Unexpected MF route '+path);
 }};return{doc,calls,commits,store,connection,authenticate:async()=>connection};
}
test('invoice bytes encrypt with RSA-OAEP SHA-256 and include hashes of actual UTF-8 bytes',async()=>{
 const h=harness(),result=await encryptedTestInvoice(h.connection,h.doc.xml);
 const exported=await webcrypto.subtle.exportKey('pkcs8',keyPair.privateKey);
 const {createPrivateKey,createDecipheriv}=await import('node:crypto');
 const key=privateDecrypt({key:createPrivateKey({key:Buffer.from(exported),format:'der',type:'pkcs8'}),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(result.encryption.encryptedSymmetricKey,'base64'));
 const decipher=createDecipheriv('aes-256-cbc',key,Buffer.from(result.encryption.initializationVector,'base64'));const plaintext=Buffer.concat([decipher.update(Buffer.from(result.invoice.encryptedInvoiceContent,'base64')),decipher.final()]).toString('utf8');
 assert.equal(plaintext,h.doc.xml);assert.equal(result.invoice.invoiceHash,sha256(h.doc.xml));assert.equal(result.invoice.invoiceSize,Buffer.byteLength(h.doc.xml));
});
test('complete protocol persists receipt and verified UPO, without persisting credentials',async()=>{
 const h=harness();await runTestOperation(h.store,'send',h.doc.id,h.authenticate);
 assert.equal(h.doc.status,'accepted');assert.equal(h.doc.ksef_number,number);assert.ok(h.doc.upo_hash);assert.ok(h.doc.closed_at);
 assert.equal(h.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/invoices')).length,1);
 assert.doesNotMatch(JSON.stringify(h.commits),/accessToken|refreshToken|privateKey|encryptedSymmetricKey/);
});
test('a failed durable checkpoint prevents MF invoice submission',async()=>{
 const h=harness({failCheckpoint:true});await assert.rejects(runTestOperation(h.store,'send',h.doc.id,h.authenticate));
 assert.equal(h.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/invoices')).length,0);
});
test('timeout after delivery reconciles by session/hash and never re-sends the invoice',async()=>{
 const h=harness({timeout:true});await assert.rejects(runTestOperation(h.store,'send',h.doc.id,h.authenticate));assert.equal(h.doc.status,'unknown');
 await runTestOperation(h.store,'refresh',h.doc.id,h.authenticate);
 assert.equal(h.doc.status,'accepted');assert.ok(h.doc.upo_hash);assert.equal(h.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/invoices')).length,1);
});
test('wrong invoice hash or UPO hash cannot be presented as a completed verified exchange',async()=>{
 const h=harness({wrongHash:true});await assert.rejects(runTestOperation(h.store,'send',h.doc.id,h.authenticate));assert.notEqual(h.doc.status,'accepted');assert.equal(h.doc.upo,null);
 const u=harness({badUpo:true});await runTestOperation(u.store,'send',u.doc.id,u.authenticate);assert.equal(u.doc.status,'accepted');assert.equal(u.doc.upo,null);
 const modified=fixture();modified.xml=modified.xml.replace('Fikcyjny odbiorca TEST','Realny klient');await assert.rejects(verifyStoredTestInvoice(modified,nip),/nie odpowiadają/);
});
test('TEST transport fixes the host, rejects redirects and exposes rate limit without retrying POST',async()=>{
 let calls=0;await assert.rejects(testRequest('https://api.ksef.mf.gov.pl/v2/auth/challenge'),/Niedozwolony/);
 await assert.rejects(testRequest('/auth/challenge',{method:'POST',fetcher:async(url,options)=>{calls++;assert.equal(url,TEST_API+'/auth/challenge');assert.equal(options.redirect,'error');return new Response('{"detail":"limit"}',{status:429,headers:{'Retry-After':'30'}});}}),e=>e.status===429&&e.retryAfter===30);
 assert.equal(calls,1);
});
