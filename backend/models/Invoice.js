import mongoose from "mongoose";
import { isPaise, isPositiveQuantity, preserveRecords, referenceExists } from "./validators.js";

const invoiceItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      validate: { validator: referenceExists("Product"), message: "Invoice product does not exist." },
    },
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, validate: { validator: isPositiveQuantity, message: "quantity must be a positive whole number." } },
    unitPrice: { type: Number, required: true, validate: { validator: isPaise, message: "unitPrice must be non-negative integer paise." } },
    totalPrice: { type: Number, required: true, validate: { validator: isPaise, message: "totalPrice must be non-negative integer paise." } },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, trim: true, unique: true, index: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
      validate: { validator: referenceExists("Customer"), message: "Invoice customer does not exist." },
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
      validate: { validator: referenceExists("Order"), message: "Invoice order does not exist." },
    },
    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipment",
      required: true,
      unique: true,
      index: true,
      validate: { validator: referenceExists("Shipment"), message: "Invoice shipment does not exist." },
    },
    invoiceDate: { type: Date, required: true },
    items: { type: [invoiceItemSchema], required: true, validate: [(items) => items.length > 0, "Invoice must include at least one item."] },
    subtotal: { type: Number, required: true, validate: { validator: isPaise, message: "subtotal must be non-negative integer paise." } },
    creditNoteAmount: { type: Number, default: 0, validate: { validator: isPaise, message: "creditNoteAmount must be non-negative integer paise." } },
    paidAmount: { type: Number, default: 0, validate: { validator: isPaise, message: "paidAmount must be non-negative integer paise." } },
    outstandingAmount: { type: Number, required: true, validate: { validator: isPaise, message: "outstandingAmount must be non-negative integer paise." } },
    status: { type: String, enum: ["Unpaid", "Partially Paid", "Paid"], default: "Unpaid", required: true },
  },
  { timestamps: true },
);

invoiceSchema.pre("validate", async function validateInvoice() {
  const total = this.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (!Number.isSafeInteger(total) || total !== this.subtotal) {
    this.invalidate("subtotal", "subtotal must equal the sum of quantity × unitPrice in paise.");
  }
  for (const [index, item] of this.items.entries()) {
    if (item.quantity * item.unitPrice !== item.totalPrice) {
      this.invalidate(`items.${index}.totalPrice`, "totalPrice must equal quantity × unitPrice.");
    }
  }
  const expectedOutstanding = this.subtotal - this.creditNoteAmount - this.paidAmount;
  if (expectedOutstanding < 0 || expectedOutstanding !== this.outstandingAmount) {
    this.invalidate("outstandingAmount", "outstandingAmount must equal subtotal less credits and payments.");
  }
  const expectedStatus =
    this.outstandingAmount === 0 ? "Paid" : this.paidAmount + this.creditNoteAmount > 0 ? "Partially Paid" : "Unpaid";
  if (this.status !== expectedStatus) {
    this.invalidate("status", `Invoice status must be ${expectedStatus} for its payment and credit totals.`);
  }

  if (!this.isNew || !this.orderId || !this.shipmentId) return;
  const session = this.$session();
  const orderQuery = mongoose.model("Order").findById(this.orderId);
  const shipmentQuery = mongoose.model("Shipment").findById(this.shipmentId);
  if (session) {
    orderQuery.session(session);
    shipmentQuery.session(session);
  }
  const [order, shipment] = await Promise.all([orderQuery, shipmentQuery]);
  if (!order || !shipment) return;
  if (String(order.customerId) !== String(this.customerId) || String(shipment.orderId) !== String(this.orderId)) {
    this.invalidate("shipmentId", "Invoice customer, order, and shipment relationships do not match.");
  }
  const shippedItems = new Map(shipment.items.map((item) => [String(item.productId), item]));
  if (
    this.items.length !== shipment.items.length ||
    this.items.some((item) => {
      const shipped = shippedItems.get(String(item.productId));
      return !shipped || item.quantity !== shipped.shippedQuantity || item.unitPrice !== shipped.unitPrice;
    })
  ) {
    this.invalidate("items", "Invoice items and historical prices must match the shipment.");
  }
});

invoiceSchema.index({ customerId: 1, invoiceDate: -1 });
preserveRecords(invoiceSchema, "Invoice");

export default mongoose.models.Invoice ?? mongoose.model("Invoice", invoiceSchema);
