import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

export function createRevenueRouter(
  databricks: DatabricksClient
) {
  const router = Router();

router.get("/revenue-trend", async (_req, res) => {
  const session = await databricks.openSession();

  try {
    const operation = await session.executeStatement(
      `
      SELECT
        month,
        ending_mrr
      FROM workspace.saas_revenue_intelligence.gold_monthly_revenue_kpis
      ORDER BY month
      `,
      {
        runAsync: true,
      }
    );

    const rows =
      (await operation.fetchAll()) as DatabricksRow[];

    await operation.close();

    res.json(
      rows.map((row) => ({
        month: row.month,
        mrr: Number(row.ending_mrr),
      }))
    );
  } catch (error) {
    console.error("Revenue trend API error:", error);

    res.status(500).json({
      error: "Unable to retrieve revenue trend.",
    });
  } finally {
    await session.close();
  }
});

router.get("/revenue-movements", async (_req, res) => {
  const session = await databricks.openSession();

  try {
    const operation = await session.executeStatement(
      `
      SELECT
        month,
        new_mrr,
        expansion_mrr,
        contraction_mrr,
        churn_mrr
      FROM workspace.saas_revenue_intelligence.gold_monthly_revenue_kpis
      ORDER BY month
      `,
      {
        runAsync: true,
      }
    );

    const rows =
      (await operation.fetchAll()) as DatabricksRow[];

    await operation.close();

    res.json(
      rows.map((row) => ({
        month: row.month,
        newMrr: Number(row.new_mrr),
        expansionMrr: Number(row.expansion_mrr),
        contractionMrr: Number(row.contraction_mrr),
        churnMrr: Number(row.churn_mrr),
      }))
    );
  } catch (error) {
    console.error(
      "Revenue movements API error:",
      error
    );

    res.status(500).json({
      error:
        "Unable to retrieve revenue movements.",
    });
  } finally {
    await session.close();
  }
});

  return router;
}