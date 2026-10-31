import mongoose from "mongoose";
import { isPaise, isPositiveQuantity, preserveRecords, referenceExists } from "./validators.js";

const shipmentItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      validate: { validator: referenceExists("Product"), message: "Shipment product does not exist." },
    },
    productName: { type: String, required: true, trim: true },
    shippedQuantity: { type: Number, required: true, validate: { validator: isPositiveQuantity, message: "shippedQuantity must be a positive whole number." } },
    unitPrice: { type: Number, required: true, validate: { validator: isPaise, message: "unitPrice must be non-negative integer paise." } },
    shipmentAmount: { type: Number, required: true, validate: { validator: isPaise, message: "shipmentAmount must be non-negative integer paise." } },
  },
  { _id: false },
);

const shipmentSchema = new mongoose.Schema(
  {
    shipmentNumber: { type: String, required: true, trim: true, unique: true, index: true },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
      validate: { validator: referenceExists("Order"), message: "Shipment order does not exist." },
    },
    shipmentDate: { type: Date, required: true },
    items: { type: [shipmentItemSchema], required: true, validate: [(items) => items.length > 0, "Shipment must include at least one item."] },
    shipmentAmount: { type: Number, required: true, validate: { validator: isPaise, message: "shipmentAmount must be non-negative integer paise." } },
    status: { type: String, enum: ["Pending", "Shipped", "Partially Shipped", "Delivered", "Cancelled"], default: "Shipped", required: true },
  },
  { timestamps: true },
);

shipmentSchema.pre("validate", function validateShipmentTotals() {
  const itemTotal = this.items.reduce((sum, item) => sum + item.shippedQuantity * item.unitPrice, 0);
  if (!Number.isSafeInteger(itemTotal) || itemTotal !== this.shipmentAmount) {
    this.invalidate("shipmentAmount", "shipmentAmount must equal the sum of shippedQuantity × unitPrice in paise.");
  }
  for (const [index, item] of this.items.entries()) {
    if (item.shippedQuantity * item.unitPrice !== item.shipmentAmount) {
      this.invalidate(`items.${index}.shipmentAmount`, "Item shipmentAmount must equal shippedQuantity × unitPrice.");
    }
  }
});

shipmentSchema.pre("validate", async function validateShipmentAgainstOrder() {
  if (!this.isNew || !this.orderId) return;
  const session = this.$session();
  const orderQuery = mongoose.model("Order").findById(this.orderId);
  if (session) orderQuery.session(session);
  const order = await orderQuery;
  if (!order) return;

  const priorShipmentsQuery = mongoose.model("Shipment").find({ orderId: this.orderId });
  if (session) priorShipmentsQuery.session(session);
  const priorShipments = await priorShipmentsQuery;
  const shippedByProduct = new Map();
  for (const shipment of priorShipments) {
    for (const item of shipment.items) {
      const key = String(item.productId);
      shippedByProduct.set(key, (shippedByProduct.get(key) ?? 0) + item.shippedQuantity);
    }
  }
  for (const [index, item] of this.items.entries()) {
    const ordered = order.items.find((entry) => String(entry.productId) === String(item.productId));
    const previouslyShipped = shippedByProduct.get(String(item.productId)) ?? 0;
    if (
      !ordered ||
      item.unitPrice !== ordered.unitPrice ||
      previouslyShipped + item.shippedQuantity > ordered.quantity
    ) {
      this.invalidate(`items.${index}`, "Shipment items must match order products/prices and not exceed the remaining quantity.");
    }
  }
});

shipmentSchema.index({ orderId: 1, shipmentDate: 1 });
preserveRecords(shipmentSchema, "Shipment");

export default mongoose.models.Shipment ?? mongoose.model("Shipment", shipmentSchema);
