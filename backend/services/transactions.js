import mongoose from "mongoose";
import { Customer, LedgerEntry } from "../models/index.js";

export async function inTransaction(work, existingSession) {
  if (existingSession) {
    return work(existingSession);
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function appendLedgerEntry(
  { customerId, transactionType, transactionId, transactionNumber, transactionDate, description, debit, credit },
  session,
) {
  const duplicate = await LedgerEntry.findOne({ transactionType, transactionId }).session(session);
  if (duplicate) return duplicate;

  const lock = await Customer.updateOne({ _id: customerId }, { $inc: { ledgerVersion: 1 } }, { session });
  if (lock.matchedCount !== 1) {
    throw new Error("Cannot post a ledger entry for a missing customer.");
  }

  const entry = new LedgerEntry({
    customerId,
    transactionType,
    transactionId,
    transactionNumber,
    transactionDate,
    description,
    debit,
    credit,
    runningBalance: 0,
  });
  await entry.save({ session });

  const entries = await LedgerEntry.find({ customerId })
    .sort({ transactionDate: 1, _id: 1 })
    .session(session);
  let runningBalance = 0;
  for (const ledgerEntry of entries) {
    runningBalance += ledgerEntry.debit - ledgerEntry.credit;
    if (!Number.isSafeInteger(runningBalance)) throw new Error("Ledger balance exceeded the supported integer range.");
    if (ledgerEntry._id.equals(entry._id)) entry.runningBalance = runningBalance;
    if (ledgerEntry.runningBalance !== runningBalance) {
      await LedgerEntry.updateOne(
        { _id: ledgerEntry._id },
        { $set: { runningBalance } },
        { session, runValidators: true },
      );
    }
  }
  return entry;
}
