// Run with: npm test   (uses Node's built-in test runner, no database needed)
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesConditions, selectWorkflow } = require('../../src/services/conditions');

const c = (field, operator, value, value2 = null) => ({ field, operator, value, value2 });

test('amount conditions match correctly for each operator', () => {
  assert.equal(matchesConditions([c('amount', 'lte', 4000)], { amount: 4000 }), true);
  assert.equal(matchesConditions([c('amount', 'lte', 4000)], { amount: 4000.01 }), false);
  assert.equal(matchesConditions([c('amount', 'gte', 30000)], { amount: 30000 }), true);
  assert.equal(matchesConditions([c('amount', 'gt', 30000)], { amount: 30000 }), false);
  assert.equal(matchesConditions([c('amount', 'between', 100, 200)], { amount: 150 }), true);
  assert.equal(matchesConditions([c('amount', 'between', 100, 200)], { amount: 201 }), false);
  assert.equal(matchesConditions([c('amount', 'eq', 500)], { amount: '500.00' }), true);
});

test('all conditions are AND-ed', () => {
  const conds = [c('amount', 'gt', 4000), c('amount', 'lt', 30000)];
  assert.equal(matchesConditions(conds, { amount: 4001 }), true);
  assert.equal(matchesConditions(conds, { amount: 4000 }), false);
  assert.equal(matchesConditions(conds, { amount: 30000 }), false);
});

test('no conditions matches everything; missing field never matches', () => {
  assert.equal(matchesConditions([], { amount: 1 }), true);
  assert.equal(matchesConditions([c('amount', 'gt', 0)], { amount: null }), false);
  assert.equal(matchesConditions([c('days', 'lte', 3)], { amount: 10 }), false);
});

test('selectWorkflow chooses by priority, then specificity', () => {
  const generic = { id: 1, priority: 0, conditions: [] };
  const small = { id: 2, priority: 0, conditions: [c('amount', 'lte', 4000)] };
  const big = { id: 3, priority: 0, conditions: [c('amount', 'gte', 30000)] };
  const urgent = { id: 4, priority: 5, conditions: [] };
  assert.equal(selectWorkflow([generic, small, big], { amount: 3000 }).id, 2); // more specific wins
  assert.equal(selectWorkflow([generic, small, big], { amount: 50000 }).id, 3);
  assert.equal(selectWorkflow([generic, small, big], { amount: 10000 }).id, 1); // fallback
  assert.equal(selectWorkflow([generic, small, urgent], { amount: 3000 }).id, 4); // priority wins
  assert.equal(selectWorkflow([small, big], { amount: 10000 }), null); // nothing matches
});
