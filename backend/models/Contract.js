import mongoose from "mongoose";
import { isPaise, preserveRecords, referenceExists } from "./validators.js";

const contractPriceSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      validate: { validator: referenceExists("Product"), message: "Contract product does not exist." },
    },
    productName: { type: String, trim: true, default: "" },
    agreedPrice: {
      type: Number,
      required: true,
      validate: { validator: isPaise, message: "agreedPrice must be non-negative integer paise." },
    },
  },
  { _id: false },
);

const contractSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
      validate: { validator: referenceExists("Customer"), message: "Contract customer does not exist." },
    },
    contractNumber: { type: String, required: true, trim: true, unique: true, index: true },
    prices: { type: [contractPriceSchema], required: true, validate: [(prices) => prices.length > 0, "Contract must include product prices."] },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, required: true },
    status: { type: String, enum: ["Active", "Expired", "Cancelled"], default: "Active", required: true },
  },
  { timestamps: true },
);

contractSchema.pre("validate", function validateContractDates() {
  if (this.effectiveFrom && this.effectiveTo && this.effectiveTo < this.effectiveFrom) {
    this.invalidate("effectiveTo", "effectiveTo must be on or after effectiveFrom.");
  }
  const productIds = this.prices.map((price) => String(price.productId));
  if (new Set(productIds).size !== productIds.length) {
    this.invalidate("prices", "A product may only have one agreed price per contract.");
  }
});

contractSchema.index({ customerId: 1, status: 1, effectiveFrom: -1 });
preserveRecords(contractSchema, "Contract");

export default mongoose.models.Contract ?? mongoose.model("Contract", contractSchema);
