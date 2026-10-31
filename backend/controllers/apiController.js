import mongoose from "mongoose";
import {
  Contract,
  CreditNote,
  Customer,
  Invoice,
  LedgerEntry,
  Order,
  Payment,
  Product,
  Shipment,
} from "../models/index.js";
import { getCreditPosition } from "../services/creditService.js";
import { approveCreditNote, createCreditNote, recordPayment, rejectCreditNote } from "../services/financial.js";
import { cancelOrder, createOrder, getOrderRemainingQuantities, previewOrder } from "../services/orderService.js";
import { getActiveContracts, getContractPricing } from "../services/pricingService.js";
import { createShipment, getShipmentById } from "../services/shipmentService.js";

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validId(id, label = "id") {
  if (!mongoose.isValidObjectId(id)) throw httpError(`Invalid ${label}.`);
  return id;
}

function dateRange(query) {
  const filter = {};
  if (query.from || query.to) {
    filter.$gte = query.from ? new Date(query.from) : new Date("1970-01-01");
    filter.$lte = query.to ? new Date(query.to) : new Date("2999-12-31");
    if (Number.isNaN(filter.$gte.getTime()) || Number.isNaN(filter.$lte.getTime())) {
      throw httpError("Date filter is invalid.");
    }
  }
  return Object.keys(filter).length ? filter : undefined;
}

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10));
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? "50", 10)));
  if (!Number.isInteger(page) || !Number.isInteger(limit)) throw httpError("Invalid pagination values.");
  return { page, limit, skip: (page - 1) * limit };
}

async function list(Model, filter, req, populate = []) {
  const { page, limit, skip } = pagination(req.query);
  let query = Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
  for (const path of populate) query = query.populate(path);
  const [items, total] = await Promise.all([query, Model.countDocuments(filter)]);
  return { items, page, limit, total, pages: Math.ceil(total / limit) };
}

function customerFilter(query) {
  const filter = {};
  if (query.customerId) filter.customerId = validId(query.customerId, "customerId");
  if (query.status) filter.status = query.status;
  if (query.from || query.to) filter.orderDate = dateRange(query);
  if (query.search) {
    const safeSearch = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (safeSearch) filter.$or = [{ orderNumber: new RegExp(safeSearch, "i") }];
  }
  return filter;
}

export async function listCustomers(req, res) {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.customerType) filter.customerType = req.query.customerType;
  if (req.query.search) {
    const search = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: new RegExp(search, "i") }, { customerCode: new RegExp(search, "i") }];
  }
  res.json(await list(Customer, filter, req));
}

export async function createCustomer(req, res) {
  const customer = await Customer.create(req.body);
  res.status(201).json(customer);
}

export async function getCustomer(req, res) {
  const customer = await Customer.findById(validId(req.params.customerId, "customerId"));
  if (!customer) throw httpError("Customer not found.", 404);
  res.json(customer);
}

export async function listProducts(req, res) {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const search = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: new RegExp(search, "i") }, { productCode: new RegExp(search, "i") }];
  }
  res.json(await list(Product, filter, req));
}

export async function createProduct(req, res) {
  res.status(201).json(await Product.create(req.body));
}

export async function listContracts(req, res) {
  const filter = {};
  if (req.query.customerId) filter.customerId = validId(req.query.customerId, "customerId");
  if (req.query.status) filter.status = req.query.status;
  res.json(await list(Contract, filter, req, ["customerId", "prices.productId"]));
}

export async function createContract(req, res) {
  res.status(201).json(await Contract.create(req.body));
}

export async function getContractPricingRoute(req, res) {
  res.json(
    await getContractPricing({
      customerId: validId(req.params.customerId, "customerId"),
      contractId: validId(req.params.contractId, "contractId"),
      date: req.query.date ? new Date(req.query.date) : new Date(),
    }),
  );
}

export async function listActiveContractsRoute(req, res) {
  res.json(await getActiveContracts(validId(req.params.customerId, "customerId"), req.query.date ? new Date(req.query.date) : new Date()));
}

export async function listOrders(req, res) {
  const filter = customerFilter(req.query);
  if (req.query.search) {
    const safe = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ orderNumber: new RegExp(safe, "i") }];
  }
  res.json(await list(Order, filter, req, ["customerId", "contractId"]));
}

export async function createOrderRoute(req, res) {
  const result = await createOrder(req.body);
  res.status(201).json(result);
}

export async function previewOrderRoute(req, res) {
  res.json(await previewOrder(req.body));
}

export async function getOrder(req, res) {
  const order = await Order.findById(validId(req.params.orderId, "orderId"))
    .populate("customerId")
    .populate("contractId");
  if (!order) throw httpError("Order not found.", 404);
  const remaining = await getOrderRemainingQuantities(order._id);
  res.json({ ...order.toObject(), remainingItems: remaining.items });
}

export async function getOrderRemaining(req, res) {
  res.json(await getOrderRemainingQuantities(validId(req.params.orderId, "orderId")));
}

export async function cancelOrderRoute(req, res) {
  res.json(await cancelOrder(validId(req.params.orderId, "orderId")));
}

export async function listShipments(req, res) {
  const filter = {};
  if (req.query.orderId) filter.orderId = validId(req.query.orderId, "orderId");
  if (req.query.from || req.query.to) filter.shipmentDate = dateRange(req.query);
  res.json(await list(Shipment, filter, req, ["orderId"]));
}

export async function createShipmentRoute(req, res) {
  res.status(201).json(await createShipment(req.body));
}

export async function getShipment(req, res) {
  const shipment = await getShipmentById(validId(req.params.shipmentId, "shipmentId"));
  if (!shipment) throw httpError("Shipment not found.", 404);
  const invoice = await Invoice.findOne({ shipmentId: shipment._id });
  res.json({ shipment, invoice });
}

export async function listInvoices(req, res) {
  const filter = {};
  if (req.query.customerId) filter.customerId = validId(req.query.customerId, "customerId");
  if (req.query.orderId) filter.orderId = validId(req.query.orderId, "orderId");
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) filter.invoiceDate = dateRange(req.query);
  res.json(await list(Invoice, filter, req, ["customerId", "orderId", "shipmentId"]));
}

export async function getInvoice(req, res) {
  const invoice = await Invoice.findById(validId(req.params.invoiceId, "invoiceId"))
    .populate("customerId")
    .populate("orderId")
    .populate("shipmentId");
  if (!invoice) throw httpError("Invoice not found.", 404);
  res.json(invoice);
}

export async function listPayments(req, res) {
  const filter = {};
  if (req.query.customerId) filter.customerId = validId(req.query.customerId, "customerId");
  if (req.query.from || req.query.to) filter.paymentDate = dateRange(req.query);
  res.json(await list(Payment, filter, req, ["customerId", "invoiceAllocations.invoiceId"]));
}

export async function createPayment(req, res) {
  res.status(201).json(await recordPayment(req.body));
}

export async function listCreditNotes(req, res) {
  const filter = {};
  if (req.query.customerId) filter.customerId = validId(req.query.customerId, "customerId");
  if (req.query.status) filter.status = req.query.status;
  if (req.query.reason) filter.reason = req.query.reason;
  res.json(await list(CreditNote, filter, req, ["customerId", "invoiceId", "orderId"]));
}

export async function createCreditNoteRoute(req, res) {
  res.status(201).json(await createCreditNote(req.body));
}

export async function updateCreditNoteStatus(req, res) {
  const creditNoteId = validId(req.params.creditNoteId, "creditNoteId");
  if (req.body.status === "Approved") return res.json(await approveCreditNote(creditNoteId));
  if (req.body.status === "Rejected") return res.json(await rejectCreditNote(creditNoteId));
  throw httpError("Credit note status must be Approved or Rejected.");
}

export async function getCustomerLedger(req, res) {
  const customerId = validId(req.params.customerId, "customerId");
  const filter = { customerId };
  if (req.query.type) filter.transactionType = req.query.type;
  if (req.query.from || req.query.to) filter.transactionDate = dateRange(req.query);
  const { page, limit, skip } = pagination(req.query);
  const [items, total] = await Promise.all([
    LedgerEntry.find(filter).sort({ transactionDate: 1, _id: 1 }).skip(skip).limit(limit),
    LedgerEntry.countDocuments(filter),
  ]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}

export async function getCustomerCredit(req, res) {
  res.json(await getCreditPosition(validId(req.params.customerId, "customerId")));
}

export async function getCustomerSummary(req, res) {
  const customerId = validId(req.params.customerId, "customerId");
  const [credit, invoices, payments, credits, orders] = await Promise.all([
    getCreditPosition(customerId),
    Invoice.find({ customerId }),
    Payment.find({ customerId }),
    CreditNote.find({ customerId, status: "Approved" }),
    Order.find({ customerId }),
  ]);
  res.json({
    credit,
    invoiceCount: invoices.length,
    invoicedAmount: invoices.reduce((sum, invoice) => sum + invoice.subtotal, 0),
    outstandingAmount: invoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0),
    paymentsReceived: payments.reduce((sum, payment) => sum + payment.amount, 0),
    approvedCreditNotes: credits.reduce((sum, note) => sum + note.amount, 0),
    orderCount: orders.length,
  });
}

export async function getDashboard(req, res) {
  const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw httpError("Dashboard date range is invalid.");
  const [customers, orders, invoices, payments, creditNotes, positions, recentOrders, allInvoices, allLedger, allOrders, allShipments, openOrders] = await Promise.all([
    Customer.find({ status: "Active" }),
    Order.find({ orderDate: { $gte: from, $lte: to } }),
    Invoice.find({ invoiceDate: { $gte: from, $lte: to } }),
    Payment.find({ paymentDate: { $gte: from, $lte: to } }),
    CreditNote.find({ approvedAt: { $gte: from, $lte: to } }),
    Customer.find({ status: "Active" }).select("_id creditLimit").lean().then((rows) =>
      Promise.all(rows.map((customer) => getCreditPosition(customer._id))),
    ),
    Order.find().sort({ createdAt: -1 }).limit(6).populate("customerId", "name customerCode"),
    Invoice.find(),
    LedgerEntry.find({ transactionDate: { $lte: to } }).sort({ transactionDate: 1, _id: 1 }),
    Order.find({ orderDate: { $lte: to }, status: { $in: ["Accepted", "Partially Shipped", "Completed", "Cancelled"] } }),
    Shipment.find({ shipmentDate: { $lte: to }, status: { $ne: "Cancelled" } }),
    Order.countDocuments({ status: { $in: ["Accepted", "Partially Shipped"] } }),
  ]);

  const months = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const ledgerRunning = new Map();
  let ledgerIndex = 0;
  while (cursor <= to) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const asOf = new Date(Math.min(monthEnd.getTime(), to.getTime()));
    while (ledgerIndex < allLedger.length && allLedger[ledgerIndex].transactionDate <= asOf) {
      const entry = allLedger[ledgerIndex];
      const key = String(entry.customerId);
      ledgerRunning.set(key, (ledgerRunning.get(key) ?? 0) + entry.debit - entry.credit);
      ledgerIndex += 1;
    }
    const label = cursor.toLocaleString("en", { month: "short", year: "2-digit" });
    const monthInvoices = invoices.filter((item) => item.invoiceDate >= monthStart && item.invoiceDate < monthEnd);
    const monthPayments = payments.filter((item) => item.paymentDate >= monthStart && item.paymentDate < monthEnd);
    const monthCredits = creditNotes.filter((item) => item.status === "Approved" && item.approvedAt >= monthStart && item.approvedAt < monthEnd);
    const monthEndShipments = allShipments.filter((shipment) => shipment.shipmentDate <= asOf);
    const shippedQuantities = new Map();
    for (const shipment of monthEndShipments) {
      for (const item of shipment.items) {
        const key = `${String(shipment.orderId)}:${String(item.productId)}`;
        shippedQuantities.set(key, (shippedQuantities.get(key) ?? 0) + item.shippedQuantity);
      }
    }
    const openOrdersValue = allOrders.reduce((sum, order) => {
      const canceledBeforeMonthEnd = order.status === "Cancelled" && order.updatedAt <= asOf;
      if (canceledBeforeMonthEnd || order.orderDate > asOf) return sum;
      return sum + order.items.reduce((orderSum, item) => {
        const shippedKey = `${String(order._id)}:${String(item.productId)}`;
        const remaining = Math.max(0, item.quantity - (shippedQuantities.get(shippedKey) ?? 0));
        return orderSum + remaining * item.unitPrice;
      }, 0);
    }, 0);
    const periodExposure = [...ledgerRunning.values()].reduce((sum, balance) => sum + balance, 0) + openOrdersValue;
    const activeCreditLimits = customers.reduce((sum, customer) => sum + customer.creditLimit, 0);
    months.push({
      month: label,
      sales: monthInvoices.reduce((sum, invoice) => sum + invoice.subtotal, 0),
      outstanding: Math.max(0, [...ledgerRunning.values()].reduce((sum, balance) => sum + balance, 0)),
      payments: monthPayments.reduce((sum, payment) => sum + payment.amount, 0),
      creditNotes: monthCredits.reduce((sum, note) => sum + note.amount, 0),
      utilizationPercent: activeCreditLimits ? Math.max(0, Math.round((periodExposure / activeCreditLimits) * 10000) / 100) : 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  res.json({
    summary: {
      customers: customers.length,
      orders: orders.length,
      acceptedOrders: orders.filter((order) => ["Accepted", "Partially Shipped", "Completed"].includes(order.status)).length,
      heldOrders: orders.filter((order) => order.status === "On Hold").length,
      invoicedAmount: invoices.reduce((sum, invoice) => sum + invoice.subtotal, 0),
      outstandingAmount: allInvoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0),
      paymentsReceived: payments.reduce((sum, payment) => sum + payment.amount, 0),
      approvedCreditNotes: creditNotes.filter((note) => note.status === "Approved").reduce((sum, note) => sum + note.amount, 0),
      openOrders,
      creditLimit: positions.reduce((sum, position) => sum + position.creditLimit, 0),
      creditExposure: positions.reduce((sum, position) => sum + position.totalExposure, 0),
      creditUtilizationPercent: positions.reduce((sum, position) => sum + position.creditLimit, 0)
        ? (positions.reduce((sum, position) => sum + position.totalExposure, 0) /
            positions.reduce((sum, position) => sum + position.creditLimit, 0)) *
          100
        : 0,
    },
    monthly: months,
    recentOrders,
  });
}

export async function getDashboardReports(req, res) {
  const customerId = req.query.customerId ? validId(req.query.customerId, "customerId") : undefined;
  const from = req.query.from ? new Date(req.query.from) : new Date(0);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw httpError("Date filter is invalid.");
  const query = { customerId, from, to };
  const [invoices, payments, orders, credits] = await Promise.all([
    Invoice.find({ ...(customerId ? { customerId } : {}), invoiceDate: { $gte: from, $lte: to } }),
    Payment.find({ ...(customerId ? { customerId } : {}), paymentDate: { $gte: from, $lte: to } }),
    Order.find({ ...(customerId ? { customerId } : {}), orderDate: { $gte: from, $lte: to } }),
    CreditNote.find({ ...(customerId ? { customerId } : {}), createdAt: { $gte: from, $lte: to } }),
  ]);
  res.json({
    filters: { customerId: query.customerId ?? null, from, to },
    invoices: {
      count: invoices.length,
      total: invoices.reduce((sum, invoice) => sum + invoice.subtotal, 0),
      outstanding: invoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0),
    },
    payments: { count: payments.length, total: payments.reduce((sum, payment) => sum + payment.amount, 0) },
    sales: { orderCount: orders.length, accepted: orders.filter((order) => order.status !== "On Hold").reduce((sum, order) => sum + order.totalAmount, 0) },
    returns: {
      count: credits.length,
      pending: credits.filter((note) => note.status === "Pending").reduce((sum, note) => sum + note.amount, 0),
      approved: credits.filter((note) => note.status === "Approved").reduce((sum, note) => sum + note.amount, 0),
    },
  });
}
