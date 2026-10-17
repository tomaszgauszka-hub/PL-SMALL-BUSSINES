import test from 'node:test';
import assert from 'node:assert/strict';
import { allRules, findRule, ruleAt, ruleForYear, ruleRef, UnsupportedPeriodError } from '../lib/tax-rules.ts';

test('every rule has a legal basis, a verified date, linked tests and non-overlapping versions', () => {
  const rules = allRules();
  assert.ok(rules.length >= 18);
  for (const rule of rules) {
    assert.ok(rule.legalBasis.length > 0, rule.id);
    for (const basis of rule.legalBasis) { assert.ok(basis.act && basis.provision, rule.id); assert.match(basis.url, /^https:\/\//); }
    assert.match(rule.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(rule.tests.length > 0, rule.id);
    assert.ok(rule.validTo === null || rule.validFrom <= rule.validTo, rule.id);
  }
  const byId = Map.groupBy(rules, rule => rule.id);
  for (const [id, versions] of byId) {
    const sorted = [...versions].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].validTo < sorted[i].validFrom, `${id} versions overlap`);
    assert.equal(new Set(versions.map(rule => rule.version)).size, versions.length, `${id} duplicate version numbers`);
  }
});

test('rules resolve by the date of the settled event, not by today', () => {
  assert.equal(ruleAt('VAT_EXEMPTION_LIMIT', '2025-12-31').params.annualLimit, 20000000);
  assert.equal(ruleAt('VAT_EXEMPTION_LIMIT', '2026-01-01').params.annualLimit, 24000000);
  assert.equal(ruleForYear('PIT_LINEAR_HEALTH_LIMIT', 2025).params.annualLimit, 1290000);
  assert.equal(ruleForYear('PIT_LINEAR_HEALTH_LIMIT', 2026).params.annualLimit, 1410000);
  assert.equal(ruleForYear('RYCZALT_ELIGIBILITY_LIMIT', 2026).params.previousYearRevenueLimit, 851720000);
  assert.equal(ruleForYear('RYCZALT_QUARTERLY_LIMIT', 2026).params.previousYearRevenueLimit, 85172000);
  assert.equal(ruleRef(ruleForYear('VAT_EXEMPTION_LIMIT', 2026)), 'VAT_EXEMPTION_LIMIT@v2');
});

test('EUR limits equal the euro amount at the NBP rate stated in the rule', () => {
  for (const id of ['RYCZALT_ELIGIBILITY_LIMIT', 'RYCZALT_QUARTERLY_LIMIT']) for (const year of [2025, 2026]) {
    const { params } = ruleForYear(id, year), rate = Number(params.eurRate.split(' ')[0].replace(',', '.'));
    assert.equal(params.previousYearRevenueLimit, Math.round(params.eurAmount * rate * 100), `${id} ${year}`);
  }
});

test('unverified periods are unsupported instead of reusing current values', () => {
  assert.equal(findRule('PIT_SCALE', '2024-12-31'), null);
  assert.equal(findRule('RYCZALT_PKT4_THRESHOLD', '2027-01-01'), null);
  assert.throws(() => ruleAt('VAT_EXEMPTION_LIMIT', '2027-01-01'), UnsupportedPeriodError);
});
