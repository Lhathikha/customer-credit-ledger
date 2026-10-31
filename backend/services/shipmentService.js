import { Customer, Order, Shipment } from "../models/index.js";
import { createInvoiceForShipment } from "./financial.js";
import { getOrderRemainingQuantities } from "./orderService.js";
import { inTransaction } from "./transactions.js";

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function createShipment(input) {
  return inTransaction(async (session) => {
    const remaining = await getOrderRemainingQuantities(input.orderId, session);
    const { order, items: remainingItems } = remaining;
    if (["On Hold", "Pending", "Cancelled", "Completed"].includes(order.status)) {
      throw requestError(`Cannot ship an order with status ${order.status}.`, 409);
    }

    const lock = await Customer.updateOne({ _id: order.customerId }, { $inc: { ledgerVersion: 1 } }, { session });
    if (lock.matchedCount !== 1) throw requestError("Order customer not found.", 409);

    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw requestError("At least one shipment item is required.");
    }
    const remainingById = new Map(remainingItems.map((item) => [String(item.productId), item]));
    const seen = new Set();
    const shipmentItems = input.items.map(({ productId, shippedQuantity }) => {
      const key = String(productId);
      if (seen.has(key)) throw requestError("A product may only appear once in a shipment.");
      seen.add(key);
      const orderItem = remainingById.get(key);
      if (!orderItem) throw requestError("Shipment product is not on the order.");
      if (!Number.isSafeInteger(shippedQuantity) || shippedQuantity <= 0) {
        throw requestError("Shipped quantities must be positive whole numbers.");
      }
      if (shippedQuantity > orderItem.remainingQuantity) {
        throw requestError(`${orderItem.productName}: quantity exceeds remaining ${orderItem.remainingQuantity}.`, 409);
      }
      return {
        productId: orderItem.productId,
        productName: orderItem.productName,
        shippedQuantity,
        unitPrice: orderItem.unitPrice,
        shipmentAmount: shippedQuantity * orderItem.unitPrice,
      };
    });
    const shipmentAmount = shipmentItems.reduce((sum, item) => sum + item.shipmentAmount, 0);
    if (!Number.isSafeInteger(shipmentAmount)) throw requestError("Shipment total exceeds the supported integer range.");

    const shipment = new Shipment({
      shipmentNumber: input.shipmentNumber,
      orderId: order._id,
      shipmentDate: input.shipmentDate ? new Date(input.shipmentDate) : new Date(),
      items: shipmentItems,
      shipmentAmount,
      status: input.status === "Delivered" ? "Delivered" : "Shipped",
    });
    await shipment.save({ session });

    const invoice = await createInvoiceForShipment(
      { shipmentId: shipment._id, invoiceNumber: input.invoiceNumber, invoiceDate: input.invoiceDate },
      session,
    );

    const nextRemaining = remainingItems.map((item) => {
      const shippedNow = shipmentItems
        .filter((shipped) => String(shipped.productId) === String(item.productId))
        .reduce((sum, shipped) => sum + shipped.shippedQuantity, 0);
      return item.remainingQuantity - shippedNow;
    });
    order.status = nextRemaining.every((quantity) => quantity === 0) ? "Completed" : "Partially Shipped";
    await order.save({ session });
    return { shipment, invoice, order };
  });
}

export async function getShipmentById(shipmentId) {
  return Shipment.findById(shipmentId)
    .populate({ path: "orderId", populate: [{ path: "customerId" }, { path: "contractId" }] })
    .populate("items.productId");
}
