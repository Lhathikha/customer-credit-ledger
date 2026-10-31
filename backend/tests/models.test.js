import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import app from "../app.js";
import { Customer, Product, Contract, Order, Shipment, Invoice, Payment, CreditNote, LedgerEntry } from "../models/index.js";

test("all ledger models load with expected references and unique keys", () => {
  assert.deepEqual(
    [Customer, Product, Contract, Order, Shipment, Invoice, Payment, CreditNote, LedgerEntry].map((model) => model.modelName),
    ["Customer", "Product", "Contract", "Order", "Shipment", "Invoice", "Payment", "CreditNote", "LedgerEntry"],
  );
  assert.equal(Customer.schema.path("customerCode").options.unique, true);
  assert.equal(Product.schema.path("productCode").options.unique, true);
  assert.equal(Invoice.schema.path("shipmentId").options.unique, true);
  assert.equal(Order.schema.path("contractId").options.ref, "Contract");
  assert.equal(LedgerEntry.schema.path("customerId").options.ref, "Customer");
  assert.ok(
    LedgerEntry.schema.indexes().some(
      ([keys, options]) => keys.transactionNumber === 1 && options.unique === true,
    ),
  );
  assert.equal(Order.schema.path("items").schema.path("unitPrice").instance, "Number");
});

test("monetary values and quantities reject fractions and negative values", async () => {
  const customer = new Customer({
    customerCode: "TEST",
    name: "Test Hospital",
    customerType: "Hospital",
    creditLimit: 100.5,
  });
  const invalidCustomer = await customer.validate().catch((error) => error);
  assert.ok(invalidCustomer instanceof mongoose.Error.ValidationError);
  assert.equal(invalidCustomer.errors.creditLimit.kind, "user defined");

  const invalidOrder = new Order({
    orderNumber: "TEST-ORDER",
    orderDate: new Date(),
    items: [{ productName: "Test", quantity: 1.5, unitPrice: -1, totalPrice: 0 }],
    totalAmount: 0,
  });
  const invalidOrderResult = await invalidOrder.validate().catch((error) => error);
  assert.ok(invalidOrderResult instanceof mongoose.Error.ValidationError);
  assert.ok(invalidOrderResult.errors["items.0.quantity"]);
  assert.ok(invalidOrderResult.errors["items.0.unitPrice"]);
});

test("order total and item snapshot reject inconsistent calculations", async () => {
  const order = new Order({
    orderNumber: "TEST-TOTAL",
    orderDate: new Date(),
    items: [{
      productName: "Test",
      quantity: 2,
      unitPrice: 100,
      totalPrice: 150,
    }],
    totalAmount: 150,
  });
  await assert.rejects(order.validate(), (error) => {
    assert.match(error.errors.totalAmount.message, /quantity × unitPrice/);
    assert.ok(error.errors["items.0.totalPrice"]);
    return true;
  });
});

test("health and not-found endpoints respond through Express middleware", async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).database, "not_configured");

    const missing = await fetch(`http://127.0.0.1:${port}/missing`);
    assert.equal(missing.status, 404);
    assert.match((await missing.json()).error, /Route not found/);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("database connection reports missing configuration explicitly", async () => {
  const { connectDatabase } = await import("../config/database.js");
  await assert.rejects(() => connectDatabase(""), /MONGO_URI is required/);
});
