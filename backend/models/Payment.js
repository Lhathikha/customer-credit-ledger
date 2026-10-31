import mongoose from "mongoose";
import { isPaise, preserveRecords, referenceExists } from "./validators.js";

const allocationSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      validate: { validator: referenceExists("Invoice"), message: "Allocated invoice does not exist." },
    },
    amount: { type: Number, required: true, validate: { validator: isPaise, message: "Allocation must be non-negative integer paise." } },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: { type: String, required: true, trim: true, unique: true, index: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
      validate: { validator: referenceExists("Customer"), message: "Payment customer does not exist." },
    },
    paymentDate: { type: Date, required: true },
    amount: { type: Number, required: true, validate: { validator: isPaise, message: "amount must be non-negative integer paise." } },
    paymentMethod: { type: String, enum: ["Cash", "Bank Transfer", "Cheque", "Card", "Other"], required: true },
    invoiceAllocations: { type: [allocationSchema], default: [] },
    referenceNumber: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

paymentSchema.pre("validate", async function validatePaymentAllocations() {
  const allocated = this.invoiceAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (!Number.isSafeInteger(allocated) || allocated > this.amount) {
    this.invalidate("invoiceAllocations", "Invoice allocations cannot exceed the payment amount.");
  }
  const session = this.$session();
  for (const [index, allocation] of this.invoiceAllocations.entries()) {
    const query = mongoose.model("Invoice").findById(allocation.invoiceId);
    if (session) query.session(session);
    const invoice = await query;
    if (invoice && String(invoice.customerId) !== String(this.customerId)) {
      this.invalidate(`invoiceAllocations.${index}.invoiceId`, "Allocated invoice belongs to another customer.");
    }
  }
});

paymentSchema.index({ customerId: 1, paymentDate: -1 });
preserveRecords(paymentSchema, "Payment");

export default mongoose.models.Payment ?? mongoose.model("Payment", paymentSchema);
