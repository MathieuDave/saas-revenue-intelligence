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
import { createAgentsRouter } from "./routes/agents.js";
import { createBriefRouter } from "./routes/brief.js";
import { createDecisionsRouter } from "./routes/decisions.js";
import { createOutcomesRouter } from "./routes/outcomes.js";
import { createAccountsRouter } from "./routes/accounts.js";
import { createFollowUpsRouter } from "./routes/followups.js";
import { createReturnsRouter } from "./routes/returns.js";

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

    // V1 : les pages d'exploration
    app.use("/api", createOverviewRouter(databricks));
    app.use("/api", createRevenueRouter(databricks));
    app.use("/api", createPrioritiesRouter(databricks));
    app.use("/api", createRiskRouter(databricks));
    app.use("/api", createExpansionRouter(databricks));
    app.use("/api", createCustomersRouter(databricks));
    app.use("/api", genieRoutes);

    // V2 : le Morning Brief et ses agents
    app.use("/api", createAgentsRouter(databricks));
    app.use("/api", createBriefRouter(databricks));
    app.use("/api", createDecisionsRouter(databricks));
    app.use("/api", createOutcomesRouter(databricks));
    app.use("/api", createAccountsRouter(databricks));
    app.use("/api", createFollowUpsRouter(databricks));
    app.use("/api", createReturnsRouter(databricks));

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