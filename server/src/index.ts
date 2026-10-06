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


const app = express();
const PORT = 3000;

type DatabricksRow = Record<string, unknown>;

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
    app.use("/api", createOverviewRouter(databricks));
    app.use("/api", createRevenueRouter(databricks));
    app.use("/api", createPrioritiesRouter(databricks));
    app.use("/api", createRiskRouter(databricks));
    app.use("/api", createExpansionRouter(databricks));  
    app.use("/api", createCustomersRouter(databricks));
    app.use("/api", genieRoutes);


    app.listen(PORT, () => {
      console.log(
        `Server running on http://localhost:${PORT}`
      );
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