import { Customer, Order } from "../models/index.js";
import { getCreditExposure, isWithinCreditLimit } from "./creditService.js";
import { quoteOrder } from "./pricingService.js";
import { inTransaction } from "./transactions.js";

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function createOrder(input) {
  return inTransaction(async (session) => {
    const customer = await Customer.findById(input.customerId).session(session);
    if (!customer || customer.status !== "Active") throw requestError("Active customer not found.", 404);

    // This write serializes credit decisions for a customer inside the transaction.
    const lock = await Customer.updateOne({ _id: customer._id }, { $inc: { ledgerVersion: 1 } }, { session });
    if (lock.matchedCount !== 1) throw requestError("Customer disappeared while placing order.", 409);

    const orderDate = input.orderDate ? new Date(input.orderDate) : new Date();
    if (Number.isNaN(orderDate.getTime())) throw requestError("orderDate is invalid.");
    const quote = await quoteOrder(
      { customerId: customer._id, contractId: input.contractId, items: input.items, date: orderDate },
      session,
    );
    const exposure = await getCreditExposure(customer._id, session);
    const totalExposure = exposure.totalExposure + quote.totalAmount;
    const accepted = isWithinCreditLimit(customer.creditLimit, totalExposure);

    const order = new Order({
      orderNumber: input.orderNumber,
      customerId: customer._id,
      contractId: quote.contract._id,
      orderDate,
      items: quote.items.map(({ productId, productName, quantity, unitPrice, totalPrice }) => ({
        productId,
        productName,
        quantity,
        unitPrice,
        totalPrice,
      })),
      totalAmount: quote.totalAmount,
      status: accepted ? "Accepted" : "On Hold",
      holdReason: accepted ? "" : "Order exceeds available customer credit.",
    });
    await order.save({ session });
    return {
      order,
      creditDecision: accepted ? "Accepted" : "On Hold",
      creditLimit: customer.creditLimit,
      existingExposure: exposure.totalExposure,
      projectedExposure: totalExposure,
      availableCredit: customer.creditLimit - exposure.totalExposure,
    };
  });
}

export async function previewOrder(input) {
  const quote = await quoteOrder({
    customerId: input.customerId,
    contractId: input.contractId,
    items: input.items,
    date: input.orderDate ? new Date(input.orderDate) : new Date(),
  });
  const exposure = await getCreditExposure(quote.customer._id);
  return {
    customerId: quote.customer._id,
    contractId: quote.contract._id,
    items: quote.items,
    totalAmount: quote.totalAmount,
    creditLimit: quote.customer.creditLimit,
    existingExposure: exposure.totalExposure,
    projectedExposure: exposure.totalExposure + quote.totalAmount,
    availableCredit: quote.customer.creditLimit - exposure.totalExposure,
    creditDecision: isWithinCreditLimit(quote.customer.creditLimit, exposure.totalExposure + quote.totalAmount)
      ? "Accepted"
      : "On Hold",
  };
}

export async function getOrderRemainingQuantities(orderId, session) {
  const orderQuery = Order.findById(orderId);
  if (session) orderQuery.session(session);
  const order = await orderQuery;
  if (!order) throw requestError("Order not found.", 404);
  const { Shipment } = await import("../models/index.js");
  const shipmentsQuery = Shipment.find({ orderId, status: { $ne: "Cancelled" } });
  if (session) shipmentsQuery.session(session);
  const shipments = await shipmentsQuery;
  const shipped = new Map();
  for (const shipment of shipments) {
    for (const item of shipment.items) {
      const id = String(item.productId);
      shipped.set(id, (shipped.get(id) ?? 0) + item.shippedQuantity);
    }
  }
  return {
    order,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice,
      orderedQuantity: item.quantity,
      shippedQuantity: shipped.get(String(item.productId)) ?? 0,
      remainingQuantity: Math.max(0, item.quantity - (shipped.get(String(item.productId)) ?? 0)),
    })),
  };
}

export async function cancelOrder(orderId) {
  return inTransaction(async (session) => {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw requestError("Order not found.", 404);
    if (["Cancelled", "Completed"].includes(order.status)) {
      throw requestError(`A ${order.status.toLowerCase()} order cannot be cancelled.`, 409);
    }
    if (order.status === "Partially Shipped") {
      throw requestError("Partially shipped orders cannot be cancelled; remaining quantities must be resolved.", 409);
    }
    const lock = await Customer.updateOne({ _id: order.customerId }, { $inc: { ledgerVersion: 1 } }, { session });
    if (lock.matchedCount !== 1) throw requestError("Order customer not found.", 409);
    order.status = "Cancelled";
    order.holdReason = "";
    await order.save({ session });
    return order;
  });
}
