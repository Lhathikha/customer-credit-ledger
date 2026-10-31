import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import app from "../app.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Contract, CreditNote, Customer, Invoice, LedgerEntry, Order, Payment, Product, Shipment } from "../models/index.js";
import { approveCreditNote, createCreditNote, createInvoiceForShipment, recordPayment } from "../services/financial.js";
import { getCreditPosition } from "../services/creditService.js";
import { createOrder, previewOrder } from "../services/orderService.js";
import { quoteOrder } from "../services/pricingService.js";
import { createShipment } from "../services/shipmentService.js";
import { seedDemo } from "../seed/seed.js";

let replicaSet;
let sequence = 0;

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(replicaSet.getUri("customer-credit-ledger-tests"));
});

after(async () => {
  await disconnectDatabase();
  await replicaSet?.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  sequence += 1;
});

async function fixture({ creditLimit = 100_000, otherCreditLimit = 100_000 } = {}) {
  const suffix = String(sequence).padStart(3, "0");
  const [customer, otherCustomer, product] = await Promise.all([
    Customer.create({ customerCode: `C-${suffix}-A`, name: "Alpha Hospital", customerType: "Hospital", creditLimit }),
    Customer.create({ customerCode: `C-${suffix}-B`, name: "Beta Hospital", customerType: "Hospital", creditLimit: otherCreditLimit }),
    Product.create({ productCode: `P-${suffix}`, name: "Test Gloves", unit: "box" }),
  ]);
  const [contract, otherContract] = await Promise.all([
    Contract.create({
      customerId: customer._id,
      contractNumber: `CT-${suffix}-A`,
      prices: [{ productId: product._id, productName: product.name, agreedPrice: 100 }],
      effectiveFrom: new Date("2025-01-01"),
      effectiveTo: new Date("2030-01-01"),
    }),
    Contract.create({
      customerId: otherCustomer._id,
      contractNumber: `CT-${suffix}-B`,
      prices: [{ productId: product._id, productName: product.name, agreedPrice: 250 }],
      effectiveFrom: new Date("2025-01-01"),
      effectiveTo: new Date("2030-01-01"),
    }),
  ]);
  return { customer, otherCustomer, product, contract, otherContract, suffix };
}

async function orderFor(f, { quantity = 10, customer = f.customer, contract = f.contract, orderNumber } = {}) {
  return createOrder({
    orderNumber: orderNumber ?? `O-${f.suffix}-${Math.random().toString(36).slice(2, 8)}`,
    customerId: customer._id,
    contractId: contract._id,
    items: [{ productId: f.product._id, quantity }],
  });
}

async function ship(f, order, quantity, tag = Math.random().toString(36).slice(2, 8)) {
  return createShipment({
    shipmentNumber: `S-${f.suffix}-${tag}`,
    invoiceNumber: `I-${f.suffix}-${tag}`,
    orderId: order._id,
    items: [{ productId: f.product._id, shippedQuantity: quantity }],
  });
}

async function creditNoteFor(f, invoice, { quantity = 1, reason = "Damaged", number } = {}) {
  return createCreditNote({
    creditNoteNumber: number ?? `CN-${f.suffix}-${Math.random().toString(36).slice(2, 8)}`,
    customerId: f.customer._id,
    invoiceId: invoice._id,
    orderId: invoice.orderId,
    returnedItems: [{
      productId: f.product._id,
      productName: f.product.name,
      quantity,
      unitPrice: 100,
      amount: quantity * 100,
    }],
    reason,
  });
}

test("twenty database-backed business scenarios", async (t) => {
  await t.test("1 customer-specific contract pricing comes from the server", async () => {
    const f = await fixture();
    const a = await quoteOrder({ customerId: f.customer._id, contractId: f.contract._id, items: [{ productId: f.product._id, quantity: 2 }] });
    const b = await quoteOrder({ customerId: f.otherCustomer._id, contractId: f.otherContract._id, items: [{ productId: f.product._id, quantity: 2 }] });
    assert.equal(a.items[0].unitPrice, 100);
    assert.equal(b.items[0].unitPrice, 250);
    assert.equal(a.totalAmount, 200);
  });

  await t.test("2 expired contract is rejected", async () => {
    const f = await fixture();
    await Contract.updateOne({ _id: f.contract._id }, { $set: { effectiveTo: new Date("2020-01-01") } });
    await assert.rejects(quoteOrder({ customerId: f.customer._id, contractId: f.contract._id, items: [{ productId: f.product._id, quantity: 1 }] }), /not active/);
  });

  await t.test("3 exact credit limit is accepted", async () => {
    const f = await fixture({ creditLimit: 1000 });
    const result = await orderFor(f, { quantity: 10 });
    assert.equal(result.creditDecision, "Accepted");
    assert.equal(result.projectedExposure, 1000);
  });

  await t.test("4 over-limit order is placed on hold and excluded from exposure", async () => {
    const f = await fixture({ creditLimit: 999 });
    const result = await orderFor(f, { quantity: 10 });
    assert.equal(result.creditDecision, "On Hold");
    assert.equal((await getCreditPosition(f.customer._id)).totalExposure, 0);
  });

  await t.test("4a concurrent orders cannot overspend customer credit", async () => {
    const f = await fixture({ creditLimit: 1000 });
    const [first, second] = await Promise.all([
      orderFor(f, { quantity: 7, orderNumber: `O-${f.suffix}-RACE-A` }),
      orderFor(f, { quantity: 7, orderNumber: `O-${f.suffix}-RACE-B` }),
    ]);
    assert.deepEqual([first.creditDecision, second.creditDecision].sort(), ["Accepted", "On Hold"]);
    assert.equal((await getCreditPosition(f.customer._id)).totalExposure, 700);
  });

  await t.test("5 partially paid invoice exposure is the remaining balance", async () => {
    const f = await fixture({ creditLimit: 5000 });
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    await recordPayment({
      paymentNumber: `PAY-${f.suffix}-PART`,
      customerId: f.customer._id,
      amount: 400,
      paymentMethod: "Bank Transfer",
      invoiceAllocations: [{ invoiceId: invoice._id, amount: 400 }],
    });
    assert.equal((await getCreditPosition(f.customer._id)).invoiceOutstanding, 600);
  });

  await t.test("6 accepted open order value contributes to exposure", async () => {
    const f = await fixture();
    const { order } = await orderFor(f, { quantity: 10 });
    assert.equal((await getCreditPosition(f.customer._id)).openOrderValue, 1000);
    assert.equal(order.status, "Accepted");
  });

  await t.test("7 shipped amount transfers exposure to invoice without double counting", async () => {
    const f = await fixture();
    const { order } = await orderFor(f, { quantity: 10 });
    await ship(f, order, 6);
    const position = await getCreditPosition(f.customer._id);
    assert.equal(position.invoiceOutstanding, 600);
    assert.equal(position.openOrderValue, 400);
    assert.equal(position.totalExposure, 1000);
  });

  await t.test("8 partial shipment invoices only shipped quantity", async () => {
    const f = await fixture();
    const { order } = await orderFor(f, { quantity: 100 });
    const { invoice } = await ship(f, order, 60);
    assert.equal(invoice.subtotal, 6000);
    assert.equal(invoice.items[0].quantity, 60);
    assert.equal((await (await import("../services/orderService.js")).getOrderRemainingQuantities(order._id)).items[0].remainingQuantity, 40);
  });

  await t.test("9 second partial shipment creates a separate invoice", async () => {
    const f = await fixture();
    const { order } = await orderFor(f, { quantity: 100 });
    const first = await ship(f, order, 60, "FIRST");
    const second = await ship(f, order, 40, "SECOND");
    assert.equal(first.invoice.subtotal, 6000);
    assert.equal(second.invoice.subtotal, 4000);
    assert.notEqual(String(first.invoice._id), String(second.invoice._id));
    assert.equal((await Order.findById(order._id)).status, "Completed");
  });

  await t.test("10 excess shipping is rejected", async () => {
    const f = await fixture();
    const { order } = await orderFor(f, { quantity: 10 });
    await assert.rejects(ship(f, order, 11), /exceeds remaining/);
    assert.equal(await Shipment.countDocuments(), 0);
  });

  await t.test("11 duplicate invoice for a shipment is rejected", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { shipment } = await ship(f, order, 10);
    await assert.rejects(createInvoiceForShipment({ shipmentId: shipment._id, invoiceNumber: `DUP-${f.suffix}` }), /already exists/);
  });

  await t.test("12 payment allocation updates invoice balance", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    await recordPayment({
      paymentNumber: `PAY-${f.suffix}-UPDATE`,
      customerId: f.customer._id,
      amount: 400,
      paymentMethod: "Cash",
      invoiceAllocations: [{ invoiceId: invoice._id, amount: 400 }],
    });
    assert.equal((await Invoice.findById(invoice._id)).outstandingAmount, 600);
  });

  await t.test("13 over-allocation is rejected and leaves the invoice unchanged", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    await assert.rejects(recordPayment({
      paymentNumber: `PAY-${f.suffix}-OVER`,
      customerId: f.customer._id,
      amount: 1001,
      paymentMethod: "Cash",
      invoiceAllocations: [{ invoiceId: invoice._id, amount: 1001 }],
    }), /exceeds|equal|allocation/i);
    assert.equal((await Invoice.findById(invoice._id)).outstandingAmount, 1000);
    assert.equal(await Payment.countDocuments(), 0);
  });

  await t.test("14 damaged return creates a pending credit note", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    const note = await creditNoteFor(f, invoice, { reason: "Damaged" });
    assert.equal(note.reason, "Damaged");
    assert.equal(note.status, "Pending");
    assert.equal((await Invoice.findById(invoice._id)).creditNoteAmount, 0);
  });

  await t.test("15 near-expiry return is supported", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    const note = await creditNoteFor(f, invoice, { reason: "Near Expiry" });
    assert.equal(note.reason, "Near Expiry");
  });

  await t.test("16 pending and rejected notes do not reduce balances", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    const pending = await creditNoteFor(f, invoice);
    assert.equal((await Invoice.findById(invoice._id)).outstandingAmount, 1000);
    const { rejectCreditNote } = await import("../services/financial.js");
    await rejectCreditNote(pending._id);
    assert.equal((await Invoice.findById(invoice._id)).outstandingAmount, 1000);
    assert.equal(await LedgerEntry.countDocuments({ transactionType: "Credit Note" }), 0);
  });

  await t.test("17 approved credit note reduces invoice balance", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    const pending = await creditNoteFor(f, invoice, { quantity: 2 });
    await approveCreditNote(pending._id);
    assert.equal((await Invoice.findById(invoice._id)).outstandingAmount, 800);
  });

  await t.test("17a approved returns cannot be credited twice", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    const first = await creditNoteFor(f, invoice, { quantity: 6, number: `CN-${f.suffix}-FIRST` });
    await approveCreditNote(first._id);
    await assert.rejects(creditNoteFor(f, invoice, { quantity: 5, number: `CN-${f.suffix}-OVER` }), /exceeds the invoiced quantity/);
  });

  await t.test("17b duplicate product lines cannot over-credit a return", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    await assert.rejects(
      createCreditNote({
        creditNoteNumber: `CN-${f.suffix}-DUPLICATE-PRODUCT`,
        customerId: f.customer._id,
        invoiceId: invoice._id,
        orderId: order._id,
        reason: "Damaged",
        returnedItems: [
          { productId: f.product._id, quantity: 6 },
          { productId: f.product._id, quantity: 6 },
        ],
      }),
      /only appear once/,
    );
    assert.equal(await CreditNote.countDocuments(), 0);
    assert.equal((await Invoice.findById(invoice._id)).outstandingAmount, 1000);
  });

  await t.test("18 ledger debits and credits reconcile to balance", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    await recordPayment({
      paymentNumber: `PAY-${f.suffix}-LEDGER`,
      customerId: f.customer._id,
      amount: 300,
      paymentMethod: "Bank Transfer",
      invoiceAllocations: [{ invoiceId: invoice._id, amount: 300 }],
    });
    const note = await creditNoteFor(f, invoice);
    await approveCreditNote(note._id);
    const entries = await LedgerEntry.find({ customerId: f.customer._id }).sort({ transactionDate: 1, _id: 1 });
    assert.deepEqual(entries.map((entry) => entry.transactionType), ["Invoice", "Payment", "Credit Note"]);
    assert.deepEqual(entries.map((entry) => entry.runningBalance), [1000, 700, 600]);
  });

  await t.test("19 duplicate financial transaction numbers are prevented", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    const data = {
      paymentNumber: `PAY-${f.suffix}-DUP`,
      customerId: f.customer._id,
      amount: 100,
      paymentMethod: "Cash",
      invoiceAllocations: [{ invoiceId: invoice._id, amount: 100 }],
    };
    await recordPayment(data);
    await assert.rejects(recordPayment(data));
    assert.equal(await Payment.countDocuments({ paymentNumber: data.paymentNumber }), 1);
    assert.equal(await LedgerEntry.countDocuments({ transactionNumber: data.paymentNumber }), 1);
  });

  await t.test("20 dashboard totals reconcile with persisted records", async () => {
    const f = await fixture();
    const { order } = await orderFor(f);
    const { invoice } = await ship(f, order, 10);
    await recordPayment({
      paymentNumber: `PAY-${f.suffix}-DASH`,
      customerId: f.customer._id,
      amount: 250,
      paymentMethod: "Bank Transfer",
      invoiceAllocations: [{ invoiceId: invoice._id, amount: 250 }],
    });
    await orderFor(f, { orderNumber: `O-${f.suffix}-OPEN` });
    const recentCreatedAt = Date.now();
    await Order.create(
      Array.from({ length: 7 }, (_, index) => ({
        orderNumber: `O-${f.suffix}-CLOSED-${index}`,
        customerId: f.customer._id,
        contractId: f.contract._id,
        orderDate: new Date(),
        items: [{ productId: f.product._id, productName: f.product.name, quantity: 1, unitPrice: 100, totalPrice: 100 }],
        totalAmount: 100,
        status: "Completed",
        createdAt: new Date(recentCreatedAt + index + 1),
      })),
    );
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/dashboard`);
      assert.equal(response.status, 200);
      const { summary } = await response.json();
      assert.equal(summary.invoicedAmount, await Invoice.aggregate([{ $group: { _id: null, sum: { $sum: "$subtotal" } } }]).then((rows) => rows[0].sum));
      assert.equal(summary.outstandingAmount, 750);
      assert.equal(summary.paymentsReceived, 250);
      assert.equal(summary.openOrders, 1);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  await t.test("21 demo seed is idempotent and commits a complete example ledger", async () => {
    const { inTransaction } = await import("../services/transactions.js");
    const first = await inTransaction(seedDemo);
    const second = await inTransaction(seedDemo);
    assert.deepEqual(first, second);
    assert.equal(await Customer.countDocuments(), 4);
    assert.equal(await Product.countDocuments(), 3);
    assert.equal(await Order.countDocuments(), 4);
    assert.equal(await Invoice.countDocuments(), 3);
    assert.equal(await Payment.countDocuments(), 1);
    assert.equal(await CreditNote.countDocuments({ status: "Approved" }), 1);
  });
});
