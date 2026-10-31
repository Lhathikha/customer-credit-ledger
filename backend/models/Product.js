import mongoose from "mongoose";
import { preserveRecords } from "./validators.js";

const productSchema = new mongoose.Schema(
  {
    productCode: { type: String, required: true, trim: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    unit: { type: String, required: true, trim: true },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active", required: true },
  },
  { timestamps: true },
);

preserveRecords(productSchema, "Product");

export default mongoose.models.Product ?? mongoose.model("Product", productSchema);
