import app from "./app.js";
import { config } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { pathToFileURL } from "node:url";

export async function startServer() {
  if (config.mongoUri) {
    await connectDatabase(config.mongoUri);
  } else {
    console.warn("MONGO_URI is not set; API starts without database access.");
  }

  const server = app.listen(config.port, () => {
    console.log(`Customer Credit Ledger API listening on port ${config.port}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received; closing the API server.`);
    server.close(async (error) => {
      if (error) {
        console.error("Failed to close the API server cleanly.", error);
        process.exitCode = 1;
      }
      await disconnectDatabase();
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error("API startup failed.", error);
    process.exitCode = 1;
  });
}
