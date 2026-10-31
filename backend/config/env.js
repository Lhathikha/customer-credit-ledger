import "dotenv/config";

const port = Number(process.env.PORT ?? 5000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

export const config = Object.freeze({
  mongoUri: process.env.MONGO_URI?.trim() || "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  port,
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
});
