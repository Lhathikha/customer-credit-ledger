import assert from "node:assert/strict";
import test from "node:test";
import { setupApiTest } from "./apiTestHelpers.js";

test("HTTP payments, returns, credit-note approval, and ledger balances stay consistent", async (t) => {
  const { request, createFixture } = await setupApiTest(t);
  const fixture = await createFixture();
  const orderNumber = `QA-ORDER-${fixture.unique}`;
  const orderResponse = await request("POST", "/api/orders", {
    orderNumber,
    customerId: fixture.customer._id,
    contractId: fixture.contract._id,
    items: [{ productId: fixture.product._id, quantity: 10 }],
  });
  assert.equal(orderResponse.status, 201);
  const orderId = orderResponse.data.order._id;

  const shipped = await request("POST", "/api/shipments", {
    shipmentNumber: `QA-S-${fixture.unique}`,
    invoiceNumber: `QA-I-${fixture.unique}`,
    orderId,
    items: [{ productId: fixture.product._id, shippedQuantity: 10 }],
  });
  assert.equal(shipped.status, 201);
  const invoiceId = shipped.data.invoice._id;
  assert.equal(shipped.data.invoice.outstandingAmount, 10_000);

  const overAllocation = await request("POST", "/api/payments", {
    paymentNumber: `QA-PAYX-${fixture.unique}`,
    customerId: fixture.customer._id,
    amount: 10_001,
    paymentMethod: "Bank Transfer",
    invoiceAllocations: [{ invoiceId, amount: 10_001 }],
  });
  assert.equal(overAllocation.status, 409);
  let invoice = await request("GET", `/api/invoices/${invoiceId}`);
  assert.equal(invoice.data.outstandingAmount, 10_000);

  const payment = await request("POST", "/api/payments", {
    paymentNumber: `QA-PAY-${fixture.unique}`,
    customerId: fixture.customer._id,
    amount: 2_500,
    paymentMethod: "Bank Transfer",
    invoiceAllocations: [{ invoiceId, amount: 2_500 }],
  });
  assert.equal(payment.status, 201);
  invoice = await request("GET", `/api/invoices/${invoiceId}`);
  assert.equal(invoice.data.paidAmount, 2_500);
  assert.equal(invoice.data.outstandingAmount, 7_500);

  const returnBody = {
    creditNoteNumber: `QA-CN1-${fixture.unique}`,
    customerId: fixture.customer._id,
    invoiceId,
    orderId,
    reason: "Damaged",
    returnedItems: [{ productId: fixture.product._id, quantity: 1 }],
  };
  const pending = await request("POST", "/api/credit-notes", returnBody);
  assert.equal(pending.status, 201);
  assert.equal(pending.data.amount, 1_000);
  let credit = await request("GET", `/api/customers/${fixture.customer._id}/credit`);
  assert.equal(credit.data.totalExposure, 7_500);

  const rejected = await request("PATCH", `/api/credit-notes/${pending.data._id}/status`, { status: "Rejected" });
  assert.equal(rejected.status, 200);
  credit = await request("GET", `/api/customers/${fixture.customer._id}/credit`);
  assert.equal(credit.data.totalExposure, 7_500);

  const approvedCandidate = await request("POST", "/api/credit-notes", {
    ...returnBody,
    creditNoteNumber: `QA-CN2-${fixture.unique}`,
  });
  assert.equal(approvedCandidate.status, 201);
  const approved = await request("PATCH", `/api/credit-notes/${approvedCandidate.data._id}/status`, { status: "Approved" });
  assert.equal(approved.status, 200);

  invoice = await request("GET", `/api/invoices/${invoiceId}`);
  assert.equal(invoice.data.creditNoteAmount, 1_000);
  assert.equal(invoice.data.outstandingAmount, 6_500);
  credit = await request("GET", `/api/customers/${fixture.customer._id}/credit`);
  assert.equal(credit.data.totalExposure, 6_500);

  const ledger = await request("GET", `/api/customers/${fixture.customer._id}/ledger`);
  assert.equal(ledger.status, 200);
  assert.deepEqual(ledger.data.items.map((entry) => entry.transactionType), ["Invoice", "Payment", "Credit Note"]);
  assert.deepEqual(ledger.data.items.map((entry) => entry.runningBalance), [10_000, 7_500, 6_500]);
});
