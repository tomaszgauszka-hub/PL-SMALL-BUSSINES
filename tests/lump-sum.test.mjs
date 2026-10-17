// Ryczałt scenarios from the specification (section 3.6). Each expected value
// is derived by hand in the comment next to it from art. 12, art. 11 ust. 1a
// and 3, art. 6 ust. 1e of the ryczałt act and art. 63 § 1 Ordynacji podatkowej:
// base per rate rounded to full złoty, total ryczałt rounded to full złoty.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLumpSumYear, classifyLumpSumLine, evaluateLumpSumEligibility, pkwiuMatch, REVENUE_CATEGORIES, revenueCategory, reviewLumpSumDocument, taxByRate } from '../lib/lump-sum.ts';
import { worstStatus } from '../lib/review-status.ts';

const zl = n => Math.round(n * 100);
const none = { social: 0, health: 0, other: 0 };
const ded = (month, values) => Array.from({ length: 12 }, (_, i) => i + 1 === month ? { ...none, ...values } : none);
const rev = (month, amountZl, categoryId) => ({ month, amount: zl(amountZl), rateBps: revenueCategory(categoryId).rateBps, categoryId });
const year = (revenues, deductions = ded(1, {}), extra = {}) => calculateLumpSumYear({ year: 2026, revenues, deductions, ...extra });
const confirmed = (categoryId, extra = {}) => ({ revenueCategory: categoryId, lumpSumRate: revenueCategory(categoryId).rateBps, classificationSource: 'user_confirmed', ...extra });

test('catalogue covers every statutory rate once per provision, with PKWiU 2015 scope', () => {
  assert.deepEqual([...new Set(REVENUE_CATEGORIES.map(c => c.rateBps))].sort((a, b) => a - b), [200, 300, 550, 850, 1000, 1200, 1400, 1500, 1700]);
  assert.equal(new Set(REVENUE_CATEGORIES.map(c => c.id)).size, REVENUE_CATEGORIES.length);
  assert.equal(new Set(REVENUE_CATEGORIES.map(c => c.provision)).size, REVENUE_CATEGORIES.length);
  for (const c of REVENUE_CATEGORIES) { assert.match(c.provision, /^art\. 12 ust\. 1 pkt \d[ab]?( lit\. [a-z])?$/); if (c.scope !== 'description') assert.ok(c.pkwiu.length, c.id); }
  // 12,5% is never selectable on its own: it only arises above the pkt 4 threshold.
  assert.ok(!REVENUE_CATEGORIES.some(c => c.rateBps === 1250));
  assert.deepEqual(REVENUE_CATEGORIES.filter(c => c.thresholdGroup === 'pkt4').map(c => c.id), ['p4-a', 'p4-b', 'p4-c', 'p4-d', 'p4-e', 'p4-f', 'p4-g']);
});

test('scenario 1: single 5,5% rate (construction)', () => {
  const r = year([rev(3, 20000, 'p6-a')]);
  assert.equal(r.months[2].tax, zl(1100)); // 20 000 × 5,5% = 1 100
  assert.equal(r.annual.tax, zl(1100));
});

test('scenario 2: single 8,5% rate with base rounding', () => {
  const r = year([rev(1, 12345.67, 'p5-a')]);
  assert.equal(r.months[0].buckets[0].base, zl(12346)); // 12 345,67 → 12 346 zł
  assert.equal(r.months[0].tax, zl(1049)); // 12 346 × 8,5% = 1 049,41 → 1 049 zł
});

test('scenario 3 and 7: single 12% rate with social and 50% of paid health contribution', () => {
  const r = year([rev(1, 15000, 'p2b-b')], ded(1, { social: zl(1000), health: zl(800) }));
  assert.equal(r.months[0].deductionUsed, zl(1400)); // 1 000 + 800 × 50%
  assert.equal(r.months[0].tax, zl(1632)); // (15 000 − 1 400) × 12% = 1 632
});

test('scenario 4 and 8: three rates in one JDG share deductions in proportion to revenue', () => {
  const r = year([rev(5, 10000, 'p6-a'), rev(5, 6000, 'p5-a'), rev(5, 4000, 'p2b-b')], ded(5, { social: zl(1000), health: zl(600) }));
  const m = r.months[4];
  // deduction 1 300 zł split 10:6:4 → 650 / 390 / 260
  assert.deepEqual(m.buckets.map(b => [b.rateBps, b.deduction, b.base]), [[550, zl(650), zl(9350)], [850, zl(390), zl(5610)], [1200, zl(260), zl(3740)]]);
  // 514,25 + 476,85 + 448,80 = 1 439,90 → 1 440 zł
  assert.equal(m.tax, zl(1440));
  assert.deepEqual(m.categories.map(c => [c.categoryId, c.revenue]), [['p6-a', zl(10000)], ['p5-a', zl(6000)], ['p2b-b', zl(4000)]]);
});

test('scenario 8: the annual return allocates deductions by annual revenue (art. 11 ust. 3)', () => {
  const r = year([rev(1, 10000, 'p6-a'), rev(2, 10000, 'p2b-b')], ded(1, { social: zl(2000) }));
  assert.equal(r.months[0].tax, zl(440)); // (10 000 − 2 000) × 5,5%
  assert.equal(r.months[1].tax, zl(1200)); // 10 000 × 12%
  // annual: 2 000 split 50/50 → 9 000 × 5,5% + 9 000 × 12% = 495 + 1 080
  assert.equal(r.annual.tax, zl(1575));
});

test('scenario 7: unused deductions carry to the following months', () => {
  const r = year([rev(1, 1000, 'p5-a'), rev(2, 10000, 'p5-a')], ded(1, { social: zl(1500) }));
  assert.equal(r.months[0].tax, 0);
  assert.equal(r.months[0].deductionCarry, zl(500));
  assert.equal(r.months[1].tax, zl(808)); // (10 000 − 500) × 8,5% = 807,50 → 808 zł
});

test('half of an odd-grosz health contribution stays exact', () => {
  const r = taxByRate(new Map([[850, 10050]]), 201); // 100,50 zł revenue, 1,005 zł deduction (201 half-grosze)
  assert.equal(r.buckets[0].base, 9900); // 100,50 − 1,005 = 99,495 → 99 zł
});

test('scenario 6: 8,5% / 12,5% applies only to pkt 4 revenue above 100 000 zł in the year', () => {
  const revenues = [1, 2, 3, 4].map(m => rev(m, 30000, 'p4-d')).concat([rev(4, 10000, 'p5-a')]);
  const r = year(revenues);
  assert.equal(r.months[2].tax, zl(2550)); // March: cumulative 90 000 → all 8,5%
  const april = r.months[3];
  assert.equal(april.pkt4Cumulative, zl(120000)); // pkt 5 revenue is not counted
  assert.deepEqual(april.buckets.map(b => [b.rateBps, b.revenue]), [[850, zl(20000)], [1250, zl(20000)]]);
  assert.equal(april.tax, zl(4200)); // 20 000 × 8,5% + 20 000 × 12,5% = 1 700 + 2 500
  assert.equal(april.categories.find(c => c.categoryId === 'p4-d').upperRateRevenue, zl(20000));
  // annual: 110 000 × 8,5% + 20 000 × 12,5% = 9 350 + 2 500
  assert.equal(r.annual.tax, zl(11850));
});

test('scenario 6: spouses who filed the art. 12 ust. 6 statement have a 200 000 zł threshold', () => {
  const r = year([rev(1, 150000, 'p4-d')], undefined, { spouses: true });
  assert.equal(r.annual.tax, zl(12750)); // 150 000 × 8,5%, below 200 000
  assert.equal(year([rev(1, 150000, 'p4-d')]).annual.tax, zl(14750)); // 100 000 × 8,5% + 50 000 × 12,5% = 8 500 + 6 250
});

test('scenario 9 and 11: a correction reduces revenue in its own period; a shortfall moves forward (art. 6 ust. 1e)', () => {
  const sameMonth = year([rev(3, 8000, 'p7-b'), rev(3, -3000, 'p7-b')]);
  assert.equal(sameMonth.months[2].tax, zl(150)); // return of goods: 5 000 × 3%
  const covered = year([rev(1, 10000, 'p5-a'), rev(2, -2000, 'p5-a'), rev(2, 5000, 'p5-a')]);
  assert.deepEqual(covered.months.slice(0, 2).map(m => m.tax), [zl(850), zl(255)]);
  const shortfall = year([rev(1, 10000, 'p5-a'), rev(2, -2000, 'p5-a'), rev(3, 4000, 'p5-a')]);
  assert.deepEqual(shortfall.months.slice(0, 3).map(m => m.tax), [zl(850), 0, zl(170)]);
  assert.deepEqual(shortfall.months[1].negativeCarry, [{ rateBps: 850, amount: zl(-2000) }]);
  assert.equal(shortfall.annual.tax, zl(1020)); // 12 000 × 8,5% equals the monthly total
  assert.equal(shortfall.issues.length, 0);
});

test('scenario 13: an uncovered reduction at the end of the year needs review', () => {
  const r = year([rev(11, 1000, 'p5-a'), rev(12, -3000, 'p5-a')]);
  assert.equal(r.months[11].tax, 0);
  assert.equal(r.annual.uncoveredReduction, zl(2000));
  assert.deepEqual(r.annual.negativeRates, [850]);
  assert.equal(r.issues.length, 1);
});

test('scenario 10: unknown or unconfirmed classification is never verified automatically', () => {
  assert.equal(classifyLumpSumLine({ lumpSumRate: 850 }, 0, 2026)[0].code, 'ryczalt.category_missing');
  assert.equal(classifyLumpSumLine({ revenueCategory: 'p2b-b', lumpSumRate: 1200, classificationSource: 'pkd_hint' }, 0, 2026)[0].status, 'NEEDS_USER_INPUT');
  assert.equal(classifyLumpSumLine({ revenueCategory: 'p2b-b', lumpSumRate: 1200, classificationSource: 'ai_suggestion' }, 0, 2026)[0].status, 'NEEDS_USER_INPUT');
  assert.equal(classifyLumpSumLine(confirmed('p2b-b', { pkwiu: '73.11.11.0' }), 0, 2026)[0].code, 'ryczalt.pkwiu_mismatch');
  assert.equal(classifyLumpSumLine(confirmed('p2b-b', { pkwiu: '62.01.11.0' }), 0, 2026)[0].status, 'AUTO_VERIFIED');
  assert.equal(pkwiuMatch(revenueCategory('p2b-b'), '62.01.11.0'), 'partial');
  assert.equal(pkwiuMatch(revenueCategory('p2a-b'), '71.12.12.0'), 'match');
  assert.equal(classifyLumpSumLine(confirmed('p4-b'), 0, 2026)[0].status, 'NEEDS_EXPERT_REVIEW');
  assert.equal(classifyLumpSumLine({ revenueCategory: 'p2b-b', lumpSumRate: 850, classificationSource: 'user_confirmed' }, 0, 2026)[0].code, 'ryczalt.rate_mismatch');
  assert.equal(classifyLumpSumLine({ revenueCategory: 'p4-d', lumpSumRate: 1250, classificationSource: 'user_confirmed' }, 0, 2026)[0].code, 'ryczalt.rate_mismatch');
  assert.equal(classifyLumpSumLine(confirmed('p4-a'), 0, 2026)[0].code, 'ryczalt.outside_jdg');
  assert.equal(classifyLumpSumLine({ revenueCategory: 'p9', lumpSumRate: 850 }, 0, 2026)[0].code, 'ryczalt.category_unknown');
});

test('scenario 5: several rates on one document need the supply structure to be stated', () => {
  const lines = [confirmed('p6-a'), confirmed('p5-a'), confirmed('p7-b')];
  const status = s => worstStatus(reviewLumpSumDocument(lines, s, 2026).map(f => f.status));
  assert.equal(status(''), 'NEEDS_USER_INPUT');
  assert.equal(status('composite'), 'NEEDS_EXPERT_REVIEW');
  assert.equal(status('separate'), 'AUTO_VERIFIED');
  // Same rate on every line: no supply-structure question.
  assert.equal(worstStatus(reviewLumpSumDocument([confirmed('p5-a'), confirmed('p5-c')], '', 2026).map(f => f.status)), 'AUTO_VERIFIED');
  // The engine separates the revenue of one document by category and rate.
  const r = year([rev(6, 12000, 'p6-a'), rev(6, 3000, 'p5-a'), rev(6, 5000, 'p7-b')]);
  assert.equal(r.months[5].tax, zl(1065)); // 660 + 255 + 150
});

test('scenario 15: a taxpayer who does not meet the conditions cannot use ryczałt', () => {
  const answers = { startedThisYear: false, previousYearRevenue: 0, cardTax: false, periodicExemption: false, pharmacy: false, currencyExchange: false, vehiclePartsTrade: false, exciseProducer: false, formerEmployerServices: false, spouseFormChange: false };
  assert.equal(worstStatus(evaluateLumpSumEligibility(2026, answers).map(f => f.status)), 'AUTO_VERIFIED');
  assert.equal(worstStatus(evaluateLumpSumEligibility(2026, { ...answers, previousYearRevenue: 851720001 }).map(f => f.status)), 'UNSUPPORTED_OR_INVALID');
  assert.equal(worstStatus(evaluateLumpSumEligibility(2026, { ...answers, previousYearRevenue: 851720000 }).map(f => f.status)), 'AUTO_VERIFIED');
  assert.equal(worstStatus(evaluateLumpSumEligibility(2026, { ...answers, vehiclePartsTrade: true }).map(f => f.status)), 'UNSUPPORTED_OR_INVALID');
  assert.equal(worstStatus(evaluateLumpSumEligibility(2026, { previousYearRevenue: 0 }).map(f => f.status)), 'NEEDS_USER_INPUT');
  assert.equal(worstStatus(evaluateLumpSumEligibility(2026, { ...answers, startedThisYear: true, previousYearRevenue: null }).map(f => f.status)), 'AUTO_VERIFIED');
});

test('periods outside the verified rule range are rejected', () => {
  assert.throws(() => calculateLumpSumYear({ year: 2027, revenues: [], deductions: [] }), /Brak zweryfikowanej reguły/);
});
