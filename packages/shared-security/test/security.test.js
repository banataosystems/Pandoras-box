const assert = require('node:assert/strict');
const test = require('node:test');

const security = require('../dist/index.js');

test('shared security package builds and exports its verified boundary', () => {
  assert.equal(typeof security, 'object');
  assert.ok(Object.keys(security).length > 0);
});
