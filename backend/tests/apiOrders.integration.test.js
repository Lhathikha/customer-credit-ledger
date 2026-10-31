import assert from "node:assert/strict";
import test from "node:test";
import { setupApiTest } from "./apiTestHelpers.js";

test("HTTP order and partial-shipment flow creates separate invoices without double-counting exposure", async (t) => {
  const { request, createFixture } = await setupApiTest(t);
  const fixture = await createFixture();
  const orderNumber = `QA-ORDER-${fixture.unique}`;

  const quote = await request("POST", "/api/orders/quote", {
    customerId: fixture.customer._id,
    contractId: fixture.contract._id,
    items: [{ productId: fixture.product._id, quantity: 10 }],
  });
  assert.equal(quote.status, 200);
  assert.equal(quote.data.items[0].unitPrice, 1_000);
  assert.equal(quote.data.totalAmount, 10_000);
  assert.equal(quote.data.creditDecision, "Accepted");

  const created = await request("POST", "/api/orders", {
    orderNumber,
    customerId: fixture.customer._id,
    contractId: fixture.contract._id,
    items: [{ productId: fixture.product._id, quantity: 10 }],
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.creditDecision, "Accepted");
  const orderId = created.data.order._id;

  let credit = await request("GET", `/api/customers/${fixture.customer._id}/credit`);
  assert.equal(credit.data.openOrderValue, 10_000);
  assert.equal(credit.data.totalExposure, 10_000);

  const first = await request("POST", "/api/shipments", {
    shipmentNumber: `QA-S1-${fixture.unique}`,
    invoiceNumber: `QA-I1-${fixture.unique}`,
    orderId,
    items: [{ productId: fixture.product._id, shippedQuantity: 4 }],
  });
  assert.equal(first.status, 201);
  assert.equal(first.data.invoice.subtotal, 4_000);
  assert.equal(first.data.invoice.items[0].quantity, 4);
  assert.equal(first.data.order.status, "Partially Shipped");

  credit = await request("GET", `/api/customers/${fixture.customer._id}/credit`);
  assert.equal(credit.data.invoiceOutstanding, 4_000);
  assert.equal(credit.data.openOrderValue, 6_000);
  assert.equal(credit.data.totalExposure, 10_000);

  const excessive = await request("POST", "/api/shipments", {
    shipmentNumber: `QA-SX-${fixture.unique}`,
    invoiceNumber: `QA-IX-${fixture.unique}`,
    orderId,
    items: [{ productId: fixture.product._id, shippedQuantity: 7 }],
  });
  assert.equal(excessive.status, 409);

  const second = await request("POST", "/api/shipments", {
    shipmentNumber: `QA-S2-${fixture.unique}`,
    invoiceNumber: `QA-I2-${fixture.unique}`,
    orderId,
    items: [{ productId: fixture.product._id, shippedQuantity: 6 }],
  });
  assert.equal(second.status, 201);
  assert.equal(second.data.invoice.subtotal, 6_000);
  assert.equal(second.data.order.status, "Completed");

  const invoices = await request("GET", `/api/invoices?orderId=${orderId}`);
  assert.equal(invoices.status, 200);
  assert.equal(invoices.data.total, 2);
  assert.deepEqual(invoices.data.items.map((invoice) => invoice.subtotal).sort((a, b) => a - b), [4_000, 6_000]);

  const orderReadback = await request("GET", `/api/orders/${orderId}`);
  assert.equal(orderReadback.status, 200);
  assert.equal(orderReadback.data.remainingItems[0].remainingQuantity, 0);

  const invoiceReadback = await request("GET", `/api/invoices/${first.data.invoice._id}`);
  assert.equal(invoiceReadback.status, 200);
  assert.equal(invoiceReadback.data.outstandingAmount, 4_000);

  credit = await request("GET", `/api/customers/${fixture.customer._id}/credit`);
  assert.equal(credit.data.openOrderValue, 0);
  assert.equal(credit.data.invoiceOutstanding, 10_000);
  assert.equal(credit.data.totalExposure, 10_000);
});
