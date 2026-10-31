import { Customer, Invoice, Order, Shipment } from "../models/index.js";

function toObjectIdString(value) {
  return String(value);
}

export async function getCreditExposure(customerId, session) {
  const invoicesQuery = Invoice.find({ customerId });
  const ordersQuery = Order.find({ customerId, status: { $in: ["Accepted", "Partially Shipped"] } });
  if (session) {
    invoicesQuery.session(session);
    ordersQuery.session(session);
  }
  const [invoices, orders] = await Promise.all([invoicesQuery, ordersQuery]);

  const invoiceOutstanding = invoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0);
  const orderIds = orders.map((order) => order._id);
  const shipmentsQuery = Shipment.find({ orderId: { $in: orderIds }, status: { $ne: "Cancelled" } });
  if (session) shipmentsQuery.session(session);
  const shipments = await shipmentsQuery;
  const shippedQuantities = new Map();
  for (const shipment of shipments) {
    for (const item of shipment.items) {
      const key = `${toObjectIdString(shipment.orderId)}:${toObjectIdString(item.productId)}`;
      shippedQuantities.set(key, (shippedQuantities.get(key) ?? 0) + item.shippedQuantity);
    }
  }

  const openOrderValue = orders.reduce(
    (orderSum, order) =>
      orderSum +
      order.items.reduce((itemSum, item) => {
        const key = `${toObjectIdString(order._id)}:${toObjectIdString(item.productId)}`;
        const remaining = Math.max(0, item.quantity - (shippedQuantities.get(key) ?? 0));
        return itemSum + remaining * item.unitPrice;
      }, 0),
    0,
  );
  return { invoiceOutstanding, openOrderValue, totalExposure: invoiceOutstanding + openOrderValue };
}

export async function getCreditPosition(customerId, session) {
  const query = Customer.findById(customerId);
  if (session) query.session(session);
  const customer = await query;
  if (!customer) {
    const error = new Error("Customer not found.");
    error.statusCode = 404;
    throw error;
  }
  const exposure = await getCreditExposure(customerId, session);
  return {
    customerId,
    creditLimit: customer.creditLimit,
    ...exposure,
    availableCredit: customer.creditLimit - exposure.totalExposure,
    utilizationPercent: customer.creditLimit === 0 ? 0 : (exposure.totalExposure / customer.creditLimit) * 100,
  };
}

export function isWithinCreditLimit(creditLimit, exposure) {
  return exposure <= creditLimit;
}
