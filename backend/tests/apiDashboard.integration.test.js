import assert from "node:assert/strict";
import test from "node:test";
import { setupApiTest } from "./apiTestHelpers.js";

test("HTTP dashboard and customer reports reconcile with persisted API records", async (t) => {
  const { request, createFixture } = await setupApiTest(t, { seed: true });

  const customers = await request("GET", "/api/customers?search=GreenCare");
  assert.equal(customers.status, 200);
  assert.equal(customers.data.total, 1);
  const customer = customers.data.items[0];

  const customerSummary = await request("GET", `/api/customers/${customer._id}/summary`);
  const customerInvoices = await request("GET", `/api/invoices?customerId=${customer._id}`);
  const customerPayments = await request("GET", `/api/payments?customerId=${customer._id}`);
  assert.equal(customerSummary.status, 200);
  assert.equal(customerSummary.data.invoicedAmount, customerInvoices.data.items.reduce((sum, item) => sum + item.subtotal, 0));
  assert.equal(customerSummary.data.paymentsReceived, customerPayments.data.items.reduce((sum, item) => sum + item.amount, 0));

  const fixture = await createFixture({ creditLimit: 25_000 });
  const extraOrder = await request("POST", "/api/orders", {
    orderNumber: `QA-OPEN-${fixture.unique}`,
    customerId: fixture.customer._id,
    contractId: fixture.contract._id,
    items: [{ productId: fixture.product._id, quantity: 2 }],
  });
  assert.equal(extraOrder.status, 201);
  assert.equal(extraOrder.data.creditDecision, "Accepted");

  const [dashboard, allInvoices, allPayments, allCreditNotes, allOrders] = await Promise.all([
    request("GET", "/api/dashboard"),
    request("GET", "/api/invoices?limit=100"),
    request("GET", "/api/payments?limit=100"),
    request("GET", "/api/credit-notes?status=Approved&limit=100"),
    request("GET", "/api/orders?limit=100"),
  ]);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.summary.invoicedAmount, allInvoices.data.items.reduce((sum, item) => sum + item.subtotal, 0));
  assert.equal(dashboard.data.summary.paymentsReceived, allPayments.data.items.reduce((sum, item) => sum + item.amount, 0));
  assert.equal(dashboard.data.summary.approvedCreditNotes, allCreditNotes.data.items.reduce((sum, item) => sum + item.amount, 0));
  assert.equal(
    dashboard.data.summary.openOrders,
    allOrders.data.items.filter((order) => ["Accepted", "Partially Shipped"].includes(order.status)).length,
  );
});
