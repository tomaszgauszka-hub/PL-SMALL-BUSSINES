import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewDocument, reviewLedger } from '../lib/document-review.ts';

const doc = (extra = {}) => ({ direction: 'purchase', status: 'issued', kind: 'regular', issueDate: '2026-05-10', taxDate: '2026-05-10', vatDate: '2026-05-10', receivedDate: '2026-05-10', parentId: '',
  net: 100000, lines: [{ name: 'Usługa', vatRate: '23', lumpSumRate: 850 }], costCategory: 'other', costDeductionBps: 10000, vatDeductionBps: 10000, notes: '', reviewAnswers: {}, ...extra });
const scale = { taxForm: 'scale', vatActive: true }, lump = { taxForm: 'lump_sum', vatActive: true };
const codes = result => result.findings.map(f => `${f.status}:${f.code}`);

test('an ordinary purchase is verified automatically', () => {
  assert.equal(reviewDocument(doc(), scale).status, 'AUTO_VERIFIED');
});

test('a purchase above 10 000 zł net asks whether it is a fixed asset and blocks one-off costs', () => {
  const big = doc({ net: 1200000, lines: [{ name: 'Maszyna', vatRate: '23', lumpSumRate: 850 }] });
  assert.deepEqual(codes(reviewDocument(big, scale)), ['NEEDS_USER_INPUT:purchase.fixed_asset']);
  assert.equal(reviewDocument({ ...big, reviewAnswers: { 'purchase.fixed_asset': 'fixed_asset' } }, scale).status, 'UNSUPPORTED_OR_INVALID');
  assert.equal(reviewDocument({ ...big, reviewAnswers: { 'purchase.fixed_asset': 'not_fixed_asset' } }, scale).status, 'AUTO_VERIFIED');
  assert.equal(reviewDocument({ ...big, costCategory: 'goods' }, scale).status, 'AUTO_VERIFIED'); // goods for resale are not fixed assets
  assert.equal(reviewDocument(big, lump).status, 'AUTO_VERIFIED'); // ryczałt has no costs
});

test('fuel for a mixed-use car allows at most 50% VAT and 75% PIT costs', () => {
  const fuel = doc({ lines: [{ name: 'Paliwo do samochodu', vatRate: '23', lumpSumRate: 850 }] });
  assert.deepEqual(codes(reviewDocument(fuel, scale)), ['NEEDS_USER_INPUT:purchase.vehicle']);
  assert.equal(reviewDocument({ ...fuel, reviewAnswers: { 'purchase.vehicle': 'mixed' } }, scale).status, 'UNSUPPORTED_OR_INVALID');
  assert.equal(reviewDocument({ ...fuel, vatDeductionBps: 5000, costDeductionBps: 7500, reviewAnswers: { 'purchase.vehicle': 'mixed' } }, scale).status, 'AUTO_VERIFIED');
  assert.equal(reviewDocument({ ...fuel, reviewAnswers: { 'purchase.vehicle': 'business_only' } }, scale).status, 'NEEDS_EXPERT_REVIEW');
  // Ryczałt: only the VAT share matters.
  assert.equal(reviewDocument({ ...fuel, vatDeductionBps: 5000, reviewAnswers: { 'purchase.vehicle': 'mixed' } }, lump).status, 'AUTO_VERIFIED');
});

test('representation expenses are not tax costs', () => {
  const dinner = doc({ lines: [{ name: 'Kolacja z kontrahentem w restauracji', vatRate: '8', lumpSumRate: 850 }] });
  assert.deepEqual(codes(reviewDocument(dinner, scale)), ['NEEDS_USER_INPUT:purchase.representation']);
  assert.equal(reviewDocument({ ...dinner, reviewAnswers: { 'purchase.representation': 'representation' } }, scale).status, 'UNSUPPORTED_OR_INVALID');
  assert.equal(reviewDocument({ ...dinner, costDeductionBps: 0, reviewAnswers: { 'purchase.representation': 'representation' } }, scale).status, 'AUTO_VERIFIED');
});

test('a laptop raises the private use question only where it changes a tax amount', () => {
  const laptop = doc({ lines: [{ name: 'Laptop 14"', vatRate: '23', lumpSumRate: 850 }] });
  assert.equal(reviewDocument(laptop, lump).findings[0].code, 'purchase.private_use'); // VAT deduction still depends on it
  assert.equal(reviewDocument(laptop, { taxForm: 'lump_sum', vatActive: false }).status, 'AUTO_VERIFIED');
  assert.equal(reviewDocument({ ...laptop, reviewAnswers: { 'purchase.private_use': 'mixed' } }, scale).status, 'NEEDS_EXPERT_REVIEW');
});

test('corrections are recognised in the period required by their cause', () => {
  const original = doc({ direction: 'sale', taxDate: '2026-03-15', issueDate: '2026-03-15' });
  const correction = doc({ direction: 'sale', kind: 'correction', parentId: 'a', issueDate: '2026-05-10', taxDate: '2026-05-10' });
  const ctx = { ...scale, source: original };
  assert.equal(reviewDocument(correction, ctx).findings[0].code, 'correction.cause');
  assert.equal(reviewDocument({ ...correction, correctionCause: 'other' }, ctx).status, 'AUTO_VERIFIED');
  assert.equal(reviewDocument({ ...correction, correctionCause: 'other', taxDate: '2026-03-15' }, ctx).findings[0].code, 'correction.period_other');
  assert.equal(reviewDocument({ ...correction, correctionCause: 'error' }, ctx).findings[0].code, 'correction.period_error');
  assert.equal(reviewDocument({ ...correction, correctionCause: 'error', taxDate: '2026-03-20' }, ctx).status, 'AUTO_VERIFIED');
  // Purchase corrections follow the receipt of the correcting invoice.
  const purchase = doc({ kind: 'correction', correctionCause: 'other', parentId: 'a', receivedDate: '2026-06-02', taxDate: '2026-05-30' });
  assert.equal(reviewDocument(purchase, scale).findings[0].code, 'correction.period_other');
});

test('ryczałt sales need confirmed revenue categories; the ledger review links corrections to their source', () => {
  const sale = doc({ id: 's1', direction: 'sale', lines: [{ name: 'Montaż', vatRate: '8', lumpSumRate: 550 }] });
  assert.deepEqual(codes(reviewDocument(sale, lump)), ['NEEDS_USER_INPUT:ryczalt.category_missing']);
  const confirmed = { ...sale, lines: [{ name: 'Montaż', vatRate: '8', lumpSumRate: 550, revenueCategory: 'p6-a', classificationSource: 'user_confirmed' }] };
  assert.equal(reviewDocument(confirmed, lump).status, 'AUTO_VERIFIED');
  assert.equal(reviewDocument(sale, scale).status, 'AUTO_VERIFIED'); // the ryczałt category is irrelevant on the scale
  const correction = { ...confirmed, id: 'k1', kind: 'correction', parentId: 's1', correctionCause: 'error', issueDate: '2026-07-01', taxDate: '2026-07-01' };
  const reviews = reviewLedger([confirmed, correction], lump);
  assert.equal(reviews.get('k1').findings[0].code, 'correction.period_error');
});

test('periods without verified rules are unsupported', () => {
  assert.equal(reviewDocument(doc({ taxDate: '2027-01-05' }), scale).status, 'UNSUPPORTED_OR_INVALID');
});
