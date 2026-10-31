import mongoose from "mongoose";
import { isPaise, preserveRecords, referenceExists } from "./validators.js";

const isSignedPaise = (value) => Number.isSafeInteger(value);

const ledgerEntrySchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
      validate: { validator: referenceExists("Customer"), message: "Ledger customer does not exist." },
    },
    transactionType: { type: String, enum: ["Order", "Invoice", "Payment", "Credit Note"], required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    transactionNumber: { type: String, required: true, trim: true },
    transactionDate: { type: Date, required: true },
    description: { type: String, required: true, trim: true },
    debit: { type: Number, required: true, validate: { validator: isPaise, message: "debit must be non-negative integer paise." } },
    credit: { type: Number, required: true, validate: { validator: isPaise, message: "credit must be non-negative integer paise." } },
    runningBalance: { type: Number, required: true, validate: { validator: isSignedPaise, message: "runningBalance must be integer paise." } },
  },
  { timestamps: true },
);

ledgerEntrySchema.pre("validate", function validateLedgerEntry() {
  if ((this.debit === 0) === (this.credit === 0)) {
    this.invalidate("debit", "Exactly one of debit or credit must be greater than zero.");
  }
});

ledgerEntrySchema.index({ customerId:  1, transactionDate: 1, _id: 1 });
ledgerEntrySchema.index({ transactionType: 1, transactionId: 1 }, { unique: true });
ledgerEntrySchema.index({ transactionNumber: 1 }, { unique: true });
preserveRecords(ledgerEntrySchema, "LedgerEntry");

export default mongoose.models.LedgerEntry ?? mongoose.model("LedgerEntry", ledgerEntrySchema);
