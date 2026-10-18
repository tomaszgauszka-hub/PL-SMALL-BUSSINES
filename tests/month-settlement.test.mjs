import test from 'node:test';
import assert from 'node:assert/strict';
import { demoJdgLedger, demoJdgProfile, demoJdgTax } from '../lib/demo-jdg.ts';
import { calculateJdgTaxes } from '../lib/jdg-tax.ts';
import { emptyState } from '../lib/domain.ts';
import { numberingGaps, plural, possibleDuplicates, settleMonth } from '../lib/month-settlement.ts';
import { invoiceInput } from '../lib/invoices.ts';
import { validNip } from '../lib/domain.ts';

const ledger = demoJdgLedger(), tax = demoJdgTax(ledger), profile = demoJdgProfile();
const report = calculateJdgTaxes(ledger, tax, tax.years[0], emptyState(), [], profile.jdgStartDate, { vatActive: true });
const settle = (month, today = '2026-10-18', data = ledger, r = report) => settleMonth({ report: r, ledger: data, profile, month, today });
const state = (s, id) => s.steps.find(step => step.id === id).state;

test('demo JDG uses four ryczałt rates, VAT and only confirmed or deliberately open classifications', () => {
  const rates = new Set(ledger.documents.filter(d => d.direction === 'sale' && d.status === 'issued').flatMap(d => d.lines.map(l => l.lumpSumRate)));
  assert.deepEqual([...rates].sort((a, b) => a - b), [300, 550, 850, 1400]);
  for (const doc of ledger.documents) { assert.ok(validNip(doc.partyNip), doc.partyName); assert.doesNotThrow(() => invoiceInput.parse({ ...doc, status: 'draft' }), doc.number); }
  const open = [...report.reviews].filter(([, r]) => r.status !== 'AUTO_VERIFIED').map(([, r]) => r.findings[0].code).sort();
  assert.deepEqual(open, ['purchase.private_use', 'ryczalt.unconfirmed']);
  assert.equal(report.issues.length, 1);
});

test('paid months are settled, September waits for payment, October is preliminary', () => {
  for (const month of [2, 3, 4, 5, 6, 7, 8]) assert.equal(settle(month).overall, 'ready', `month ${month}`);
  const september = settle(9), row = report.rows[8];
  assert.equal(september.overall, 'to_pay');
  assert.equal(september.amounts.toPay, row.pitDue + row.vatDue);
  assert.deepEqual(september.deadlines, { pit: '2026-10-20', vat: '2026-10-26' }); // 25.10.2026 is a Sunday
  assert.equal(state(september, 'payments'), 'pending');
  const october = settle(10);
  assert.equal(october.overall, 'preliminary');
  assert.equal(state(october, 'decisions'), 'action');
  assert.equal(october.steps.find(s => s.id === 'decisions').documents.length, 2);
  assert.equal(state(october, 'documents'), 'action'); // one draft
  assert.equal(state(october, 'contributions'), 'action');
  assert.equal(settle(11).overall, 'empty');
});

test('a missed deadline turns a pending payment into an action', () => {
  const late = settle(9, '2026-10-21');
  assert.equal(state(late, 'payments'), 'action');
  assert.match(late.steps.find(s => s.id === 'payments').summary, /po terminie 20\.10\.2026/);
});

test('a document with an invalid treatment blocks the month', () => {
  const docs = structuredClone(ledger.documents), fuel = docs.find(d => d.partyName.startsWith('Stacja') && d.issueDate.startsWith('2026-09'));
  fuel.vatDeductionBps = 10000; // mixed-use car: at most 50% VAT
  const data = { ...ledger, documents: docs }, r = calculateJdgTaxes(data, tax, tax.years[0], emptyState(), [], profile.jdgStartDate, { vatActive: true });
  const s = settle(9, '2026-10-18', data, r);
  assert.equal(s.overall, 'blocked');
  assert.equal(state(s, 'decisions'), 'blocked');
  assert.equal(state(s, 'pit'), 'blocked');
});

test('numbering gaps and possible duplicate purchases are detected', () => {
  assert.deepEqual(numberingGaps(ledger.documents, 2026), []);
  const docs = ledger.documents.filter(d => d.number !== 'FV/2026/3');
  assert.deepEqual(numberingGaps(docs, 2026), ['FV/2026/3']);
  const paper = ledger.documents.find(d => d.partyName.startsWith('Hurtownia') && d.issueDate.startsWith('2026-09'));
  const copy = { ...paper, id: crypto.randomUUID(), number: 'ZAK/999/2026' };
  assert.equal(possibleDuplicates([...ledger.documents, copy], '2026-09').length, 1);
  assert.equal(possibleDuplicates([...ledger.documents, copy], '2026-08').length, 0);
});

test('Polish plural forms', () => {
  assert.deepEqual([1, 2, 4, 5, 12, 22, 25].map(n => plural(n, 'sprawa', 'sprawy', 'spraw')), ['sprawa', 'sprawy', 'sprawy', 'spraw', 'spraw', 'sprawy', 'spraw']);
});
