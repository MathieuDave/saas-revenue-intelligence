import { Router } from "express";
import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

export function createOverviewRouter(
  databricks: DatabricksClient
) {
  const router = Router();

  router.get("/overview", async (_req, res) => {
    const session = await databricks.openSession();

    try {
      const operation = await session.executeStatement(
        `
        SELECT
          current_arr,
          mrr_growth_pct,
          nrr_pct,
          priority_arr_at_risk,
          expansion_priority_accounts
        FROM workspace.saas_revenue_intelligence.gold_revenue_command_center_snapshot
        ORDER BY snapshot_date DESC
        LIMIT 1
        `,
        {
          runAsync: true,
        }
      );

      const rows =
        (await operation.fetchAll()) as DatabricksRow[];

      await operation.close();

      const row = rows[0];

      if (!row) {
        return res.status(404).json({
          error: "No overview data found.",
        });
      }

      res.json({
        arr: Number(row.current_arr),
        mrrGrowth: Number(row.mrr_growth_pct),
        nrr: Number(row.nrr_pct),
        priorityArrAtRisk: Number(
          row.priority_arr_at_risk
        ),
        expansionPriorityAccounts: Number(
          row.expansion_priority_accounts
        ),
      });
    } catch (error) {
      console.error("Overview API error:", error);

      res.status(500).json({
        error: "Unable to retrieve overview data.",
      });
    } finally {
      await session.close();
    }
  });

  return router;
}