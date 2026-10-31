import mongoose from "mongoose";

export function isPaise(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveQuantity(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function referenceExists(modelName) {
  return async function validateReference(value) {
    if (!value || !mongoose.models[modelName]) {
      return false;
    }

    let query = mongoose.model(modelName).exists({ _id: value });
    const session = this?.$session?.();
    if (session) query = query.session(session);
    return Boolean(await query);
  };
}

export function preserveRecords(schema, modelName) {
  const rejectDelete = function rejectHistoricalDelete() {
    throw new Error(`${modelName} records are historical and cannot be deleted.`);
  };

  for (const operation of ["deleteOne", "deleteMany", "findOneAndDelete", "findOneAndRemove"]) {
    schema.pre(operation, rejectDelete);
  }
  schema.pre("deleteOne", { document: true, query: false }, rejectDelete);
}
