import mongoose from "mongoose";

export async function connectDatabase(uri) {
  if (!uri) {
    throw new Error("MONGO_URI is required to connect to MongoDB.");
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log("Connected to MongoDB.");
  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function getDatabaseStatus() {
  return ["disconnected", "connected", "connecting", "disconnecting"][
    mongoose.connection.readyState
  ] ?? "unknown";
}
