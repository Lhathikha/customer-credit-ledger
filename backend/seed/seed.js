import { config } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Customer, Product, Contract, Order, Shipment, Invoice, Payment, CreditNote, LedgerEntry } from "../models/index.js";
import { approveCreditNote, createInvoiceForShipment, recordPayment } from "../services/financial.js";
import { inTransaction } from "../services/transactions.js";
import { pathToFileURL } from "node:url";

const demoDate = new Date("2026-10-25T12:00:00.000Z");
const modelList = [Customer, Product, Contract, Order, Shipment, Invoice, Payment, CreditNote, LedgerEntry];

async function ensure(Model, key, values, session) {
  const query = Model.findOne(key);
  if (session) query.session(session);
  const existing = await query;
  if (existing) return existing;
  const document = new Model(values);
  await document.save({ session });
  return document;
}

export async function seedDemo(session) {
  const customerInputs = [
    { customerCode: "CUST-GREENCARE", name: "GreenCare Hospital", customerType: "Hospital", creditLimit: 1_000_000 },
    { customerCode: "CUST-CITY", name: "City Hospital", customerType: "Hospital", creditLimit: 1_500_000 },
    { customerCode: "CUST-MEDPLUS", name: "MedPlus Distributor", customerType: "Distributor", creditLimit: 2_000_000 },
    { customerCode: "CUST-LIFECARE", name: "LifeCare Hospital", customerType: "Hospital", creditLimit: 1_200_000 },
  ];
  const customers = {};
  for (const input of customerInputs) {
    customers[input.customerCode] = await ensure(Customer, { customerCode: input.customerCode }, input, session);
  }

  const productInputs = [
    { productCode: "PROD-GLOVES", name: "Surgical Gloves", description: "Disposable examination gloves", unit: "pair" },
    { productCode: "PROD-MASKS", name: "Face Masks", description: "Disposable medical face masks", unit: "box" },
    { productCode: "PROD-SANITIZER", name: "Sanitizer", description: "Hand sanitizer", unit: "bottle" },
  ];
  const products = {};
  for (const input of productInputs) {
    products[input.productCode] = await ensure(Product, { productCode: input.productCode }, input, session);
  }

  const priceSets = {
    "CUST-GREENCARE": [1000, 400, 900],
    "CUST-CITY": [1100, 450, 950],
    "CUST-MEDPLUS": [900, 350, 750],
    "CUST-LIFECARE": [1050, 500, 1000],
  };
  const contracts = {};
  for (const [customerCode, prices] of Object.entries(priceSets)) {
    const customer = customers[customerCode];
    const contractNumber = `CON-${customerCode}`;
    contracts[customerCode] = await ensure(
      Contract,
      { contractNumber },
      {
        customerId: customer._id,
        contractNumber,
        prices: productInputs.map((product, index) => ({
          productId: products[product.productCode]._id,
          productName: products[product.productCode].name,
          agreedPrice: prices[index],
        })),
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2030-12-31T23:59:59.999Z"),
        status: "Active",
      },
      session,
    );
  }

  const gloves = products["PROD-GLOVES"];
  const masks = products["PROD-MASKS"];
  const sanitizer = products["PROD-SANITIZER"];
  const greenCare = customers["CUST-GREENCARE"];
  const city = customers["CUST-CITY"];
  const medPlus = customers["CUST-MEDPLUS"];
  const lifeCare = customers["CUST-LIFECARE"];

  const exactLimitOrder = await ensure(
    Order,
    { orderNumber: "ORD-DEMO-EXACT-LIMIT" },
    {
      orderNumber: "ORD-DEMO-EXACT-LIMIT",
      customerId: greenCare._id,
      orderDate: demoDate,
      items: [{ productId: gloves._id, productName: gloves.name, quantity: 1000, unitPrice: 1000, totalPrice: 1_000_000 }],
      totalAmount: 1_000_000,
      status: "Partially Shipped",
      contractId: contracts["CUST-GREENCARE"]._id,
    },
    session,
  );
  const overLimitOrder = await ensure(
    Order,
    { orderNumber: "ORD-DEMO-OVER-LIMIT" },
    {
      orderNumber: "ORD-DEMO-OVER-LIMIT",
      customerId: medPlus._id,
      orderDate: demoDate,
      items: [{ productId: masks._id, productName: masks.name, quantity: 6000, unitPrice: 350, totalPrice: 2_100_000 }],
      totalAmount: 2_100_000,
      status: "On Hold",
      holdReason: "Order total exceeds the customer's credit limit.",
      contractId: contracts["CUST-MEDPLUS"]._id,
    },
    session,
  );
  const cityOrder = await ensure(
    Order,
    { orderNumber: "ORD-DEMO-CITY-PARTIAL-PAYMENT" },
    {
      orderNumber: "ORD-DEMO-CITY-PARTIAL-PAYMENT",
      customerId: city._id,
      orderDate: demoDate,
      items: [{ productId: sanitizer._id, productName: sanitizer.name, quantity: 100, unitPrice: 950, totalPrice: 95_000 }],
      totalAmount: 95_000,
      status: "Completed",
      contractId: contracts["CUST-CITY"]._id,
    },
    session,
  );
  const lifeCareOrder = await ensure(
    Order,
    { orderNumber: "ORD-DEMO-DAMAGED-RETURN" },
    {
      orderNumber: "ORD-DEMO-DAMAGED-RETURN",
      customerId: lifeCare._id,
      orderDate: demoDate,
      items: [{ productId: masks._id, productName: masks.name, quantity: 20, unitPrice: 500, totalPrice: 10_000 }],
      totalAmount: 10_000,
      status: "Completed",
      contractId: contracts["CUST-LIFECARE"]._id,
    },
    session,
  );

  const greenShipment = await ensure(
    Shipment,
    { shipmentNumber: "SHP-DEMO-GREENCARE-PARTIAL" },
    {
      shipmentNumber: "SHP-DEMO-GREENCARE-PARTIAL",
      orderId: exactLimitOrder._id,
      shipmentDate: demoDate,
      items: [{ productId: gloves._id, productName: gloves.name, shippedQuantity: 100, unitPrice: 1000, shipmentAmount: 100_000 }],
      shipmentAmount: 100_000,
      status: "Partially Shipped",
    },
    session,
  );
  const cityShipment = await ensure(
    Shipment,
    { shipmentNumber: "SHP-DEMO-CITY-PARTIAL-PAYMENT" },
    {
      shipmentNumber: "SHP-DEMO-CITY-PARTIAL-PAYMENT",
      orderId: cityOrder._id,
      shipmentDate: demoDate,
      items: [{ productId: sanitizer._id, productName: sanitizer.name, shippedQuantity: 100, unitPrice: 950, shipmentAmount: 95_000 }],
      shipmentAmount: 95_000,
      status: "Delivered",
    },
    session,
  );
  const lifeCareShipment = await ensure(
    Shipment,
    { shipmentNumber: "SHP-DEMO-LIFECARE-DAMAGED-RETURN" },
    {
      shipmentNumber: "SHP-DEMO-LIFECARE-DAMAGED-RETURN",
      orderId: lifeCareOrder._id,
      shipmentDate: demoDate,
      items: [{ productId: masks._id, productName: masks.name, shippedQuantity: 20, unitPrice: 500, shipmentAmount: 10_000 }],
      shipmentAmount: 10_000,
      status: "Delivered",
    },
    session,
  );

  const invoiceInputs = [
    { invoiceNumber: "INV-DEMO-GREENCARE-UNPAID", shipmentId: greenShipment._id },
    { invoiceNumber: "INV-DEMO-CITY-PARTIAL", shipmentId: cityShipment._id },
    { invoiceNumber: "INV-DEMO-LIFECARE-RETURN", shipmentId: lifeCareShipment._id },
  ];
  const invoices = {};
  for (const input of invoiceInputs) {
    const existing = await Invoice.findOne({ shipmentId: input.shipmentId }).session(session);
    invoices[input.invoiceNumber] =
      existing ??
      (await createInvoiceForShipment({ ...input, invoiceDate: demoDate }, session));
  }

  const paymentNumber = "PAY-DEMO-CITY-PARTIAL";
  if (!(await Payment.exists({ paymentNumber }).session(session))) {
    await recordPayment(
      {
        paymentNumber,
        customerId: city._id,
        paymentDate: demoDate,
        amount: 30_000,
        paymentMethod: "Bank Transfer",
        invoiceAllocations: [{ invoiceId: invoices["INV-DEMO-CITY-PARTIAL"]._id, amount: 30_000 }],
        referenceNumber: "DEMO-BANK-001",
      },
      session,
    );
  }

  const creditNoteNumber = "CN-DEMO-LIFECARE-DAMAGED";
  let creditNote = await CreditNote.findOne({ creditNoteNumber }).session(session);
  if (!creditNote) {
    creditNote = new CreditNote({
      creditNoteNumber,
      customerId: lifeCare._id,
      invoiceId: invoices["INV-DEMO-LIFECARE-RETURN"]._id,
      orderId: lifeCareOrder._id,
      returnedItems: [{ productId: masks._id, productName: masks.name, quantity: 2, unitPrice: 500, amount: 1000 }],
      reason: "Damaged",
      amount: 1000,
      status: "Pending",
      createdAt: demoDate,
    });
    await creditNote.save({ session });
  }
  if (creditNote.status === "Pending") {
    await approveCreditNote(creditNote._id, session);
  }

  return {
    customers: customerInputs.length,
    products: productInputs.length,
    orders: 4,
    shipments: 3,
    invoices: 3,
    paymentNumber,
    creditNoteNumber,
    exactLimitOrder: exactLimitOrder.orderNumber,
    overLimitOrder: overLimitOrder.orderNumber,
  };
}

async function runSeed() {
  try {
    if (!config.mongoUri) throw new Error("Set MONGO_URI in backend/.env before running the seed.");
    await connectDatabase(config.mongoUri);
    await Promise.all(modelList.map((model) => model.init()));
    const result = await inTransaction(seedDemo);
    console.log("Seed completed (safe to rerun):", result);
  } catch (error) {
    console.error("Seed failed; no partial transaction was committed.", error);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSeed();
}
