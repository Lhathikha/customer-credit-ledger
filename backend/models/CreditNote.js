import mongoose from "mongoose";
import { isPaise, isPositiveQuantity, preserveRecords, referenceExists } from "./validators.js";

const returnedItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      validate: { validator: referenceExists("Product"), message: "Returned product does not exist." },
    },
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, validate: { validator: isPositiveQuantity, message: "quantity must be a positive whole number." } },
    unitPrice: { type: Number, required: true, validate: { validator: isPaise, message: "unitPrice must be non-negative integer paise." } },
    amount: { type: Number, required: true, validate: { validator: isPaise, message: "item amount must be non-negative integer paise." } },
  },
  { _id: false },
);

const creditNoteSchema = new mongoose.Schema(
  {
    creditNoteNumber: { type: String, required: true, trim: true, unique: true, index: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
      validate: { validator: referenceExists("Customer"), message: "Credit note customer does not exist." },
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
      validate: { validator: referenceExists("Invoice"), message: "Credit note invoice does not exist." },
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
      validate: { validator: referenceExists("Order"), message: "Credit note order does not exist." },
    },
    returnedItems: { type: [returnedItemSchema], required: true, validate: [(items) => items.length > 0, "Credit note must include returned items."] },
    reason: { type: String, enum: ["Damaged", "Near Expiry"], required: true },
    amount: { type: Number, required: true, validate: { validator: isPaise, message: "amount must be non-negative integer paise." } },
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending", required: true },
    createdAt: { type: Date, default: Date.now, immutable: true },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

creditNoteSchema.pre("validate", async function validateCreditNote() {
  const productIds = this.returnedItems.map((item) => String(item.productId));
  if (new Set(productIds).size !== productIds.length) {
    this.invalidate("returnedItems", "Each product may only appear once in a credit note.");
  }

  const total = this.returnedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (!Number.isSafeInteger(total) || total !== this.amount) {
    this.invalidate("amount", "amount must equal the sum of returned quantity × historical unitPrice in paise.");
  }
  for (const [index, item] of this.returnedItems.entries()) {
    if (item.quantity * item.unitPrice !== item.amount) {
      this.invalidate(`returnedItems.${index}.amount`, "Item amount must equal quantity × unitPrice.");
    }
  }

  if (!this.invoiceId || !this.orderId) return;
  const session = this.$session();
  const invoiceQuery = mongoose.model("Invoice").findById(this.invoiceId);
  const orderQuery = mongoose.model("Order").findById(this.orderId);
  if (session) {
    invoiceQuery.session(session);
    orderQuery.session(session);
  }
  const [invoice, order] = await Promise.all([invoiceQuery, orderQuery]);
  if (!invoice || !order) return;
  if (
    String(invoice.customerId) !== String(this.customerId) ||
    String(invoice.orderId) !== String(this.orderId) ||
    String(order.customerId) !== String(this.customerId)
  ) {
    this.invalidate("invoiceId", "Credit note customer, invoice, and order relationships do not match.");
  }
  for (const [index, returned] of this.returnedItems.entries()) {
    const invoiced = invoice.items.find((item) => String(item.productId) === String(returned.productId));
    if (!invoiced || returned.unitPrice !== invoiced.unitPrice || returned.quantity > invoiced.quantity) {
      this.invalidate(`returnedItems.${index}`, "Returned item must match an invoiced product and historical unit price.");
    }
  }
});

creditNoteSchema.index({ customerId: 1, createdAt: -1 });
preserveRecords(creditNoteSchema, "CreditNote");

export default mongoose.models.CreditNote ?? mongoose.model("CreditNote", creditNoteSchema);
