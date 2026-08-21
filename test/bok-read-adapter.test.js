"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  BOK_READ_ACTIONS,
  BokReadAdapter,
  BokReadAdapterError,
} = require("../dist/projectos/bok-read-adapter.js");

const GROUP_ID = "b0000000-0000-4000-8000-000000000001";
const PROJECT_REF = "zztqshkhoxqbnzmdhlts";

function scoped(overrides = {}) {
  return {
    environment: "test",
    synthetic: true,
    groupId: GROUP_ID,
    ...overrides,
  };
}

test("BOK adapter exposes only the v1 read actions", () => {
  assert.deepEqual(BOK_READ_ACTIONS, ["health", "portfolio.summary"]);
});

test("BOK adapter blocks mutation-shaped actions before transport", async () => {
  let calls = 0;
  const adapter = new BokReadAdapter({
    pilotGroupId: GROUP_ID,
    async transport() { calls += 1; return {}; },
  });

  for (const action of ["orders.create", "menu.set_availability", "promotion.activate", "customers.list"]) {
    await assert.rejects(() => adapter.execute(action), BokReadAdapterError);
  }
  assert.equal(calls, 0);
});

test("BOK health requires the synthetic scope and strips unexpected fields", async () => {
  const adapter = new BokReadAdapter({
    pilotGroupId: GROUP_ID,
    async transport(request) {
      assert.deepEqual(request, { action: "health", groupId: GROUP_ID, mode: "read-only" });
      return scoped({ status: "ok", projectRef: PROJECT_REF, token: "must-not-leak" });
    },
  });

  assert.deepEqual(await adapter.execute("health"), {
    status: "ok",
    environment: "test",
    synthetic: true,
    groupId: GROUP_ID,
    projectRef: PROJECT_REF,
  });
});

test("BOK portfolio returns owner-safe aggregates and drops PII-shaped extras", async () => {
  const adapter = new BokReadAdapter({
    pilotGroupId: GROUP_ID,
    async transport() {
      return scoped({
        group: { id: GROUP_ID, name: "[TEST] BOK Pilot", slug: "test-bok-pilot", secret: "drop-me" },
        restaurants: [
          { id: "r-1", name: "[TEST] Porknyeta", slug: "test-porknyeta", branchCount: 1, productCount: 2, mobile_e164: "+639000000000" },
          { id: "r-2", name: "[TEST] Cardiac Delights", slug: "test-cardiac-delights", branchCount: 1, productCount: 2, customers: [{ display_name: "Synthetic Person" }] },
          { id: "r-3", name: "[TEST] 80/20 Burger Bar", slug: "test-80-20-burger-bar", branchCount: 1, productCount: 2, api_key: "drop-me" },
        ],
        totals: { restaurants: 3, branches: 3, products: 6, customers: 0, orders: 0, revenue: 999999 },
        customers: [{ mobile_e164: "+639000000000" }],
      });
    },
  });

  const result = await adapter.execute("portfolio.summary");
  assert.deepEqual(result.totals, { restaurants: 3, branches: 3, products: 6, customers: 0, orders: 0 });
  assert.equal(result.restaurants.length, 3);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("+639"), false);
  assert.equal(serialized.includes("api_key"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("revenue"), false);
});

test("BOK adapter rejects wrong group or non-test transport responses", async () => {
  const wrongGroup = new BokReadAdapter({
    pilotGroupId: GROUP_ID,
    async transport() { return scoped({ groupId: "wrong", status: "ok", projectRef: PROJECT_REF }); },
  });
  await assert.rejects(() => wrongGroup.execute("health"), /group does not match/i);

  const liveScope = new BokReadAdapter({
    pilotGroupId: GROUP_ID,
    async transport() { return { environment: "production", synthetic: false, groupId: GROUP_ID, status: "ok", projectRef: PROJECT_REF }; },
  });
  await assert.rejects(() => liveScope.execute("health"), /outside the synthetic test scope/i);
});
