import mongoose from "mongoose";
import { CreditNote, Customer, Invoice, Payment, Shipment, Order } from "../models/index.js";
import { appendLedgerEntry, inTransaction } from "./transactions.js";

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function missing(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

export function createInvoiceForShipment(input, session) {
  return inTransaction(async (transactionSession) => {
    const shipment = await Shipment.findById(input.shipmentId).session(transactionSession);
    if (!shipment) throw missing("Shipment not found.");
    const order = await Order.findById(shipment.orderId).session(transactionSession);
    if (!order) throw missing("Shipment order not found.");
    if (await Invoice.exists({ shipmentId: shipment._id }).session(transactionSession)) {
      throw conflict("An invoice already exists for this shipment.");
    }

    const subtotal = shipment.items.reduce((sum, item) => sum + item.shippedQuantity * item.unitPrice, 0);
    const invoice = new Invoice({
      invoiceNumber: input.invoiceNumber,
      customerId: order.customerId,
      orderId: order._id,
      shipmentId: shipment._id,
      invoiceDate: input.invoiceDate ?? new Date(),
      items: shipment.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.shippedQuantity,
        unitPrice: item.unitPrice,
        totalPrice: item.shippedQuantity * item.unitPrice,
      })),
      subtotal,
      creditNoteAmount: 0,
      paidAmount: 0,
      outstandingAmount: subtotal,
      status: "Unpaid",
    });
    await invoice.save({ session: transactionSession });
    await appendLedgerEntry(
      {
        customerId: invoice.customerId,
        transactionType: "Invoice",
        transactionId: invoice._id,
        transactionNumber: invoice.invoiceNumber,
        transactionDate: invoice.invoiceDate,
        description: `Invoice for shipment ${shipment.shipmentNumber}`,
        debit: invoice.subtotal,
        credit: 0,
      },
      transactionSession,
    );
    return invoice;
  }, session);
}

export function recordPayment(input, session) {
  return inTransaction(async (transactionSession) => {
    const customer = await Customer.findById(input.customerId).session(transactionSession);
    if (!customer) throw missing("Payment customer not found.");
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw conflict("Payment amount must be a positive integer amount in paise.");
    }

    const payment = new Payment({
      ...input,
      paymentDate: input.paymentDate ?? new Date(),
      invoiceAllocations: input.invoiceAllocations ?? [],
    });
    if (payment.invoiceAllocations.length === 0) {
      throw conflict("Allocate the payment to at least one invoice.");
    }
    if (new Set(payment.invoiceAllocations.map((allocation) => String(allocation.invoiceId))).size !== payment.invoiceAllocations.length) {
      throw conflict("Each invoice may only appear once in a payment allocation.");
    }
    if (payment.invoiceAllocations.reduce((sum, allocation) => sum + allocation.amount, 0) !== payment.amount) {
      throw conflict("Payment amount must equal the total of its invoice allocations.");
    }
    const lock = await Customer.updateOne({ _id: customer._id }, { $inc: { ledgerVersion: 1 } }, { session: transactionSession });
    if (lock.matchedCount !== 1) throw conflict("Payment customer not found.");
    for (const allocation of payment.invoiceAllocations) {
      if (!Number.isSafeInteger(allocation.amount) || allocation.amount <= 0) {
        throw conflict("Invoice allocation amounts must be positive integer paise.");
      }
      const invoice = await Invoice.findById(allocation.invoiceId).session(transactionSession);
      if (!invoice) throw missing(`Allocated invoice ${allocation.invoiceId} not found.`);
      if (String(invoice.customerId) !== String(customer._id)) {
        throw conflict("Allocated invoice belongs to another customer.");
      }
      if (allocation.amount > invoice.outstandingAmount) {
        throw conflict(`Allocation exceeds the outstanding amount on invoice ${invoice.invoiceNumber}.`);
      }
      invoice.paidAmount += allocation.amount;
      invoice.outstandingAmount -= allocation.amount;
      invoice.status = invoice.outstandingAmount === 0 ? "Paid" : "Partially Paid";
      await invoice.save({ session: transactionSession });
    }

    await payment.save({ session: transactionSession });
    await appendLedgerEntry(
      {
        customerId: customer._id,
        transactionType: "Payment",
        transactionId: payment._id,
        transactionNumber: payment.paymentNumber,
        transactionDate: payment.paymentDate,
        description: `Payment received via ${payment.paymentMethod}`,
        debit: 0,
        credit: payment.amount,
      },
      transactionSession,
    );
    return payment;
  }, session);
}

export function createCreditNote(input, session) {
  return inTransaction(async (transactionSession) => {
    const customer = await Customer.findById(input.customerId).session(transactionSession);
    if (!customer) throw missing("Credit note customer not found.");
    const invoice = await Invoice.findById(input.invoiceId).session(transactionSession);
    if (!invoice) throw missing("Credit note invoice not found.");
    if (String(invoice.customerId) !== String(customer._id)) throw conflict("Invoice belongs to another customer.");
    if (String(invoice.orderId) !== String(input.orderId)) throw conflict("Credit note order does not match the invoice.");
    const order = await Order.findById(input.orderId).session(transactionSession);
    if (!order || String(order.customerId) !== String(customer._id)) throw conflict("Order belongs to another customer.");
    if (!Array.isArray(input.returnedItems) || input.returnedItems.length === 0) {
      throw conflict("At least one returned item is required.");
    }
    const seenProducts = new Set();
    const returnedItems = input.returnedItems.map(({ productId, quantity }) => {
      const productKey = String(productId);
      if (seenProducts.has(productKey)) {
        throw conflict("Each product may only appear once in a return.");
      }
      seenProducts.add(productKey);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw conflict("Return quantities must be positive whole numbers.");
      }
      const invoiceItem = invoice.items.find((item) => String(item.productId) === String(productId));
      if (!invoiceItem) throw conflict("Returned product is not on the original invoice.");
      return {
        productId: invoiceItem.productId,
        productName: invoiceItem.productName,
        quantity,
        unitPrice: invoiceItem.unitPrice,
        amount: quantity * invoiceItem.unitPrice,
      };
    });
    const creditAmount = returnedItems.reduce((sum, item) => sum + item.amount, 0);
    if (!Number.isSafeInteger(creditAmount)) throw conflict("Credit note total exceeds the supported integer range.");
    const creditNote = new CreditNote({
      ...input,
      returnedItems,
      amount: creditAmount,
      status: "Pending",
    });
    await creditNote.validate({ session: transactionSession });

    const approvedNotes = await CreditNote.find({ invoiceId: invoice._id, status: "Approved" }).session(transactionSession);
    for (const returned of creditNote.returnedItems) {
      const alreadyApproved = approvedNotes.reduce(
        (sum, note) =>
          sum +
          note.returnedItems
            .filter((item) => String(item.productId) === String(returned.productId))
            .reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      );
      const invoiced = invoice.items.find((item) => String(item.productId) === String(returned.productId));
      if (!invoiced || alreadyApproved + returned.quantity > invoiced.quantity) {
        throw conflict("Returned quantity exceeds the invoiced quantity less approved returns.");
      }
    }
    await creditNote.save({ session: transactionSession });
    return creditNote;
  }, session);
}

export function rejectCreditNote(creditNoteId, session) {
  return inTransaction(async (transactionSession) => {
    const creditNote = await CreditNote.findById(creditNoteId).session(transactionSession);
    if (!creditNote) throw missing("Credit note not found.");
    if (creditNote.status !== "Pending") throw conflict("Only pending credit notes can be rejected.");
    creditNote.status = "Rejected";
    await creditNote.save({ session: transactionSession });
    return creditNote;
  }, session);
}

export function approveCreditNote(creditNoteId, session) {
  return inTransaction(async (transactionSession) => {
    const creditNote = await CreditNote.findById(creditNoteId).session(transactionSession);
    if (!creditNote) throw missing("Credit note not found.");
    if (creditNote.status !== "Pending") {
      throw conflict("Only pending credit notes can be approved.");
    }
    const lock = await Customer.updateOne(
      { _id: creditNote.customerId },
      { $inc: { ledgerVersion: 1 } },
      { session: transactionSession },
    );
    if (lock.matchedCount !== 1) throw missing("Credit note customer not found.");

    const invoice = await Invoice.findById(creditNote.invoiceId).session(transactionSession);
    if (!invoice) throw missing("Credit note invoice not found.");
    if (String(invoice.customerId) !== String(creditNote.customerId)) {
      throw conflict("Credit note and invoice customer do not match.");
    }
    if (creditNote.amount > invoice.outstandingAmount) {
      throw conflict("Credit note exceeds the invoice's outstanding amount.");
    }

    const priorApproved = await CreditNote.find({
      invoiceId: invoice._id,
      status: "Approved",
      _id: { $ne: creditNote._id },
    }).session(transactionSession);
    for (const returned of creditNote.returnedItems) {
      const creditedQuantity = priorApproved.reduce(
        (sum, note) =>
          sum +
          note.returnedItems
            .filter((item) => String(item.productId) === String(returned.productId))
            .reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      );
      const invoiced = invoice.items.find((item) => String(item.productId) === String(returned.productId));
      if (!invoiced || creditedQuantity + returned.quantity > invoiced.quantity) {
        throw conflict("Approved returns cannot exceed the invoiced quantity.");
      }
    }

    invoice.creditNoteAmount += creditNote.amount;
    invoice.outstandingAmount -= creditNote.amount;
    invoice.status = invoice.outstandingAmount === 0 ? "Paid" : "Partially Paid";
    await invoice.save({ session: transactionSession });

    creditNote.status = "Approved";
    creditNote.approvedAt = new Date();
    await creditNote.save({ session: transactionSession });
    await appendLedgerEntry(
      {
        customerId: creditNote.customerId,
        transactionType: "Credit Note",
        transactionId: creditNote._id,
        transactionNumber: creditNote.creditNoteNumber,
        transactionDate: creditNote.approvedAt,
        description: `Approved ${creditNote.reason.toLowerCase()} credit note`,
        debit: 0,
        credit: creditNote.amount,
      },
      transactionSession,
    );
    return creditNote;
  }, session);
}

export function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}
