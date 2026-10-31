import mongoose from "mongoose";
import { isPaise, isPositiveQuantity, preserveRecords, referenceExists } from "./validators.js";

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      validate: { validator: referenceExists("Product"), message: "Order product does not exist." },
    },
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, validate: { validator: isPositiveQuantity, message: "quantity must be a positive whole number." } },
    unitPrice: { type: Number, required: true, validate: { validator: isPaise, message: "unitPrice must be non-negative integer paise." } },
    totalPrice: { type: Number, required: true, validate: { validator: isPaise, message: "totalPrice must be non-negative integer paise." } },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, trim: true, unique: true, index: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
      validate: { validator: referenceExists("Customer"), message: "Order customer does not exist." },
    },
    orderDate: { type: Date, required: true },
    items: { type: [orderItemSchema], required: true, validate: [(items) => items.length > 0, "Order must include at least one item."] },
    totalAmount: { type: Number, required: true, validate: { validator: isPaise, message: "totalAmount must be non-negative integer paise." } },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "On Hold", "Partially Shipped", "Completed", "Cancelled"],
      default: "Pending",
      required: true,
    },
    holdReason: { type: String, trim: true, default: "" },
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
      validate: { validator: referenceExists("Contract"), message: "Order contract does not exist." },
    },
  },
  { timestamps: true },
);

orderSchema.pre("validate", function validateOrderTotals() {
  const itemTotal = this.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (!Number.isSafeInteger(itemTotal) || itemTotal !== this.totalAmount) {
    this.invalidate("totalAmount", "totalAmount must equal the sum of quantity × unitPrice in paise.");
  }
  for (const [index, item] of this.items.entries()) {
    if (item.quantity * item.unitPrice !== item.totalPrice) {
      this.invalidate(`items.${index}.totalPrice`, "totalPrice must equal quantity × unitPrice.");
    }
  }
  if (this.status === "On Hold" && !this.holdReason) {
    this.invalidate("holdReason", "An on-hold order requires a holdReason.");
  }
});

orderSchema.pre("validate", async function validateOrderContract() {
  if (!this.isNew || !this.contractId || !this.customerId) return;
  const query = mongoose.model("Contract").findById(this.contractId);
  if (this.$session()) query.session(this.$session());
  const contract = await query;
  if (!contract) return;
  if (String(contract.customerId) !== String(this.customerId)) {
    this.invalidate("contractId", "Order contract must belong to the order customer.");
    return;
  }
  if (
    contract.status !== "Active" ||
    this.orderDate < contract.effectiveFrom ||
    this.orderDate > contract.effectiveTo
  ) {
    this.invalidate("contractId", "Order date must fall within an active contract.");
  }
  for (const [index, item] of this.items.entries()) {
    const price = contract.prices.find((entry) => String(entry.productId) === String(item.productId));
    if (!price || item.unitPrice !== price.agreedPrice) {
      this.invalidate(`items.${index}.unitPrice`, "Order unitPrice must match the customer's contracted price.");
    }
  }
});

orderSchema.pre("validate", function validateUniqueOrderProducts() {
  const productIds = this.items.map((item) => String(item.productId));
  if (new Set(productIds).size !== productIds.length) {
    this.invalidate("items", "An order may contain each product only once.");
  }
});

orderSchema.index({ customerId: 1, orderDate: -1 });
preserveRecords(orderSchema, "Order");

export default mongoose.models.Order ?? mongoose.model("Order", orderSchema);
