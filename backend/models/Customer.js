import mongoose from "mongoose";
import { isPaise, preserveRecords } from "./validators.js";

const customerSchema = new mongoose.Schema(
  {
    customerCode: { type: String, required: true, trim: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    customerType: { type: String, enum: ["Hospital", "Distributor"], required: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    creditLimit: {
      type: Number,
      required: true,
      validate: { validator: isPaise, message: "creditLimit must be non-negative integer paise." },
    },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active", required: true },
    ledgerVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

customerSchema.index({ name: 1 });
preserveRecords(customerSchema, "Customer");

export default mongoose.models.Customer ?? mongoose.model("Customer", customerSchema);
