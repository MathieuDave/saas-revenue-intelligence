import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

export function createPrioritiesRouter(
  databricks: DatabricksClient
) {
  const router = Router();

router.get("/retention-priorities", async (_req, res) => {
  const session = await databricks.openSession();

  try {
    const operation = await session.executeStatement(
      `
      SELECT
        company_name,
        current_arr,
        days_to_renewal,
        revenue_risk_score,
        risk_level,
        priority_category,
        recommended_action
      FROM workspace.saas_revenue_intelligence.gold_customer_actions_explained
      WHERE priority_category = 'Retention Priority'
      ORDER BY revenue_risk_score DESC, current_arr DESC
      LIMIT 10
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
        companyName: row.company_name,
        arr: Number(row.current_arr),
        daysToRenewal: Number(row.days_to_renewal),
        riskScore: Number(row.revenue_risk_score),
        riskLevel: row.risk_level,
        priorityCategory: row.priority_category,
        recommendedAction: row.recommended_action,
      }))
    );
  } catch (error) {
    console.error("Retention priorities API error:", error);

    res.status(500).json({
      error: "Unable to retrieve retention priorities.",
    });
  } finally {
    await session.close();
  }
});

router.get("/expansion-priorities", async (_req, res) => {
  const session = await databricks.openSession();

  try {
    const operation = await session.executeStatement(
      `
      SELECT
        company_name,
        current_arr,
        plan,
        current_license_utilization_pct,
        current_feature_adoption_pct,
        expansion_opportunity_score,
        opportunity_level,
        recommended_action
      FROM workspace.saas_revenue_intelligence.gold_customer_actions_explained
      WHERE priority_category = 'Expansion Priority'
      ORDER BY
        expansion_opportunity_score DESC,
        current_arr DESC
      LIMIT 10
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
        companyName: row.company_name,
        arr: Number(row.current_arr),
        plan: row.plan,
        licenseUtilization: Number(
          row.current_license_utilization_pct
        ),
        featureAdoption: Number(
          row.current_feature_adoption_pct
        ),
        opportunityScore: Number(
          row.expansion_opportunity_score
        ),
        opportunityLevel: row.opportunity_level,
        recommendedAction: row.recommended_action,
      }))
    );
  } catch (error) {
    console.error("Expansion priorities API error:", error);

    res.status(500).json({
      error: "Unable to retrieve expansion priorities.",
    });
  } finally {
    await session.close();
  }
});

  return router;
}