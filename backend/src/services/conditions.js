// Pure functions (no DB) - unit tested in tests/unit/conditions.test.js
const OPS = {
  eq: (a, v) => a === v,
  gt: (a, v) => a > v,
  gte: (a, v) => a >= v,
  lt: (a, v) => a < v,
  lte: (a, v) => a <= v,
  between: (a, v, v2) => a >= v && a <= v2,
};

/** All conditions are AND-ed. A request without the field (e.g. no amount) never matches a condition on it. */
function matchesConditions(conditions, request) {
  return (conditions || []).every((c) => {
    const raw = request[c.field];
    if (raw === null || raw === undefined || raw === '') return false;
    const actual = Number(raw);
    if (Number.isNaN(actual) || !OPS[c.operator]) return false;
    return OPS[c.operator](actual, Number(c.value), c.value2 == null ? null : Number(c.value2));
  });
}

/**
 * Picks the workflow for a request from active candidates:
 * highest priority first, then most specific (most conditions), then oldest.
 */
function selectWorkflow(candidates, request) {
  return (
    candidates
      .filter((w) => matchesConditions(w.conditions, request))
      .sort((a, b) => b.priority - a.priority || b.conditions.length - a.conditions.length || a.id - b.id)[0] || null
  );
}

module.exports = { matchesConditions, selectWorkflow };
