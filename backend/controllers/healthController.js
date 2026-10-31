import { config } from "../config/env.js";
import { getDatabaseStatus } from "../config/database.js";

export function getHealth(_request, response) {
  const database = getDatabaseStatus();
  const notConfigured = !config.mongoUri;
  const ready = notConfigured || database === "connected";

  response.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "unavailable",
    service: "customer-credit-ledger-api",
    database: notConfigured ? "not_configured" : database,
    environment: config.nodeEnv,
  });
}
