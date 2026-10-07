import express from "express";
import cors from "cors";

import { connectToDatabricks } from "./databricks.js";

import healthRoutes from "./routes/health.js";
import { createOverviewRouter } from "./routes/overview.js";
import { createRevenueRouter } from "./routes/revenue.js";
import { createPrioritiesRouter } from "./routes/priorities.js";
import { createRiskRouter } from "./routes/risk.js";
import { createExpansionRouter } from "./routes/expansion.js";
import { createCustomersRouter } from "./routes/customers.js";
import genieRoutes from "./routes/genie.js";
import { createTimelineRouter } from "./routes/timeline.js";
import { createSignalsRouter } from "./routes/signals.js";
import { createLiveRouter } from "./routes/live.js";
import { initSimulation } from "./simulation.js";
import { createAgentsRouter } from "./routes/agents.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use("/api", healthRoutes);

async function startServer() {
  try {
    /*
     * Connexion Databricks unique au démarrage.
     * On ne reconnecte PAS Databricks à chaque requête.
     */
    const databricks = await connectToDatabricks();
    await initSimulation(databricks);
    app.use("/api", createOverviewRouter(databricks));
    app.use("/api", createRevenueRouter(databricks));
    app.use("/api", createPrioritiesRouter(databricks));
    app.use("/api", createRiskRouter(databricks));
    app.use("/api", createExpansionRouter(databricks));
    app.use("/api", createCustomersRouter(databricks));
    app.use("/api", createTimelineRouter(databricks));
    app.use("/api", createSignalsRouter(databricks));
    app.use("/api", genieRoutes);
    app.use("/api", createLiveRouter());
    app.use("/api", createAgentsRouter(databricks));


    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(
      "Unable to initialize Databricks connection:",
      error
    );

    process.exit(1);
  }
}

startServer();