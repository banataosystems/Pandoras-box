"use strict";

const BOK_READ_ACTIONS = Object.freeze(["health", "portfolio.summary"]);
const BOK_READ_ACTION_SET = new Set(BOK_READ_ACTIONS);

class BokReadAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = "BokReadAdapterError";
  }
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BokReadAdapterError(`${label} must be an object`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BokReadAdapterError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function count(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new BokReadAdapterError(`${label} must be a non-negative integer`);
  }
  return value;
}

function assertSyntheticScope(payload, pilotGroupId) {
  const value = record(payload, "BOK response");
  if (value.environment !== "test" || value.synthetic !== true) {
    throw new BokReadAdapterError("BOK response is outside the synthetic test scope");
  }
  if (value.groupId !== pilotGroupId) {
    throw new BokReadAdapterError("BOK response group does not match the configured pilot group");
  }
  return value;
}

function cleanRestaurant(value, index) {
  const restaurant = record(value, `restaurants[${index}]`);
  return Object.freeze({
    id: text(restaurant.id, `restaurants[${index}].id`),
    name: text(restaurant.name, `restaurants[${index}].name`),
    slug: text(restaurant.slug, `restaurants[${index}].slug`),
    branchCount: count(restaurant.branchCount, `restaurants[${index}].branchCount`),
    productCount: count(restaurant.productCount, `restaurants[${index}].productCount`),
  });
}

function cleanTotals(value) {
  const totals = record(value, "totals");
  return Object.freeze({
    restaurants: count(totals.restaurants, "totals.restaurants"),
    branches: count(totals.branches, "totals.branches"),
    products: count(totals.products, "totals.products"),
    customers: count(totals.customers, "totals.customers"),
    orders: count(totals.orders, "totals.orders"),
  });
}

class BokReadAdapter {
  constructor({ transport, pilotGroupId }) {
    if (typeof transport !== "function") {
      throw new BokReadAdapterError("BOK adapter requires a transport function");
    }
    this.transport = transport;
    this.pilotGroupId = text(pilotGroupId, "pilotGroupId");
  }

  get actions() {
    return BOK_READ_ACTIONS;
  }

  async execute(action, args = {}) {
    if (!BOK_READ_ACTION_SET.has(action)) {
      throw new BokReadAdapterError(`BOK adapter action is not read-only allowlisted: ${String(action)}`);
    }
    const input = record(args, "args");
    if (Object.prototype.hasOwnProperty.call(input, "groupId") && input.groupId !== this.pilotGroupId) {
      throw new BokReadAdapterError("BOK adapter cannot override the configured pilot group");
    }

    const raw = await this.transport(Object.freeze({
      action,
      groupId: this.pilotGroupId,
      mode: "read-only",
    }));
    const payload = assertSyntheticScope(raw, this.pilotGroupId);

    if (action === "health") {
      return Object.freeze({
        status: payload.status === "ok" ? "ok" : "degraded",
        environment: "test",
        synthetic: true,
        groupId: this.pilotGroupId,
        projectRef: text(payload.projectRef, "projectRef"),
      });
    }

    const group = record(payload.group, "group");
    if (group.id !== this.pilotGroupId) {
      throw new BokReadAdapterError("Portfolio group does not match the configured pilot group");
    }
    if (!Array.isArray(payload.restaurants) || payload.restaurants.length > 50) {
      throw new BokReadAdapterError("restaurants must be an array with at most 50 entries");
    }

    return Object.freeze({
      environment: "test",
      synthetic: true,
      group: Object.freeze({
        id: this.pilotGroupId,
        name: text(group.name, "group.name"),
        slug: text(group.slug, "group.slug"),
      }),
      restaurants: Object.freeze(payload.restaurants.map(cleanRestaurant)),
      totals: cleanTotals(payload.totals),
    });
  }
}

module.exports = {
  BOK_READ_ACTIONS,
  BokReadAdapter,
  BokReadAdapterError,
};
