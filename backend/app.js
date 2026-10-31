import cors from "cors";
import express from "express";
import { config } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import healthRoutes from "./routes/healthRoutes.js";
import apiRoutes from "./routes/apiRoutes.js";

const app = express();

app.use(cors({ origin: config.clientUrl }));
app.use(express.json({ limit: "1mb" }));
app.use("/api/health", healthRoutes);
app.use("/api", apiRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
