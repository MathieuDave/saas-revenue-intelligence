import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

export function createExpansionRouter(
  databricks: DatabricksClient
) {
  const router = Router();

    // =========================================================
    // EXPANSION OPPORTUNITIES
    // =========================================================

    router.get("/expansion", async (_req, res) => {
      const session = await databricks.openSession();

      try {
        async function executeQuery(sql: string) {
          const operation =
            await session.executeStatement(sql, {
              runAsync: true,
            });

          try {
            return (await operation.fetchAll()) as DatabricksRow[];
          } finally {
            await operation.close();
          }
        }

        // -----------------------------------------------------
        // 1. OPPORTUNITY DISTRIBUTION + ARR
        // -----------------------------------------------------

        const distributionRows = await executeQuery(`
          SELECT
            opportunity_level,
            COUNT(*) AS accounts,
            SUM(current_arr) AS arr
          FROM workspace.saas_revenue_intelligence.gold_customer_opportunity_scores
          GROUP BY opportunity_level
          ORDER BY
            CASE opportunity_level
              WHEN 'Very High' THEN 1
              WHEN 'High' THEN 2
              WHEN 'Moderate' THEN 3
              WHEN 'Low' THEN 4
              ELSE 5
            END
        `);

        const opportunityDistribution =
          distributionRows.map((row) => ({
            opportunityLevel: String(
              row.opportunity_level
            ),
            accounts: Number(row.accounts),
            arr: Number(row.arr),
          }));

        // -----------------------------------------------------
        // 2. KPI
        // -----------------------------------------------------

        const kpiRows = await executeQuery(`
          SELECT
            COUNT(*) AS expansion_priority_accounts,
            SUM(current_arr) AS expansion_priority_arr
          FROM workspace.saas_revenue_intelligence.gold_customer_actions_explained
          WHERE priority_category = 'Expansion Priority'
        `);

        const kpiRow = kpiRows[0];

        const expansionPriorityAccounts = Number(
          kpiRow?.expansion_priority_accounts ?? 0
        );

        const arrInExpansionAccounts = Number(
          kpiRow?.expansion_priority_arr ?? 0
        );

      const priorityLevelRows = await executeQuery(`
  SELECT
    opportunity_level,
    COUNT(*) AS accounts
  FROM workspace.saas_revenue_intelligence.gold_customer_actions_explained
  WHERE priority_category = 'Expansion Priority'
  GROUP BY opportunity_level
`);

const veryHighOpportunityAccounts = Number(
  priorityLevelRows.find(
    (row) =>
      String(row.opportunity_level) === "Very High"
  )?.accounts ?? 0
);

const highOpportunityAccounts = Number(
  priorityLevelRows.find(
    (row) =>
      String(row.opportunity_level) === "High"
  )?.accounts ?? 0
);

                // -----------------------------------------------------
        // 3. PRIMARY EXPANSION DRIVERS
        // Expansion Priority accounts only
        // -----------------------------------------------------

        const expansionDriverRows =
          await executeQuery(`
            SELECT
              SUM(o.utilization_opportunity_points)
                AS utilization_points,
              SUM(o.adoption_opportunity_points)
                AS adoption_points,
              SUM(o.growth_opportunity_points)
                AS growth_points,
              SUM(o.plan_opportunity_points)
                AS plan_points

            FROM workspace.saas_revenue_intelligence.gold_customer_opportunity_scores o

            INNER JOIN workspace.saas_revenue_intelligence.gold_customer_actions_explained a
              ON o.customer_id = a.customer_id

            WHERE a.priority_category = 'Expansion Priority'
          `);

        const expansionDriverRow =
          expansionDriverRows[0];

        const expansionDrivers = [
          {
            driver: "License Utilization",
            points: Number(
              expansionDriverRow?.utilization_points ?? 0
            ),
          },
          {
            driver: "Feature Adoption",
            points: Number(
              expansionDriverRow?.adoption_points ?? 0
            ),
          },
          {
            driver: "Employee Growth",
            points: Number(
              expansionDriverRow?.growth_points ?? 0
            ),
          },
          {
            driver: "Current Plan",
            points: Number(
              expansionDriverRow?.plan_points ?? 0
            ),
          },
        ];

        // -----------------------------------------------------
        // 4. EXPANSION PRIORITY ACCOUNTS BY PLAN
        // -----------------------------------------------------

        const planRows = await executeQuery(`
          SELECT
            plan,
            COUNT(*) AS accounts,
            SUM(current_arr) AS arr
          FROM workspace.saas_revenue_intelligence.gold_customer_actions_explained
          WHERE priority_category = 'Expansion Priority'
          GROUP BY plan
          ORDER BY accounts DESC
        `);

        const expansionByPlan = planRows.map(
          (row) => ({
            plan: String(row.plan),
            accounts: Number(row.accounts),
            arr: Number(row.arr),
          })
        );

        // -----------------------------------------------------
        // 5. ACCOUNTS WITH EXPANSION POTENTIAL
        // -----------------------------------------------------

        const expansionAccountRows =
          await executeQuery(`
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
          `);

        const expansionAccounts =
          expansionAccountRows.map((row) => ({
            companyName: String(row.company_name),
            arr: Number(row.current_arr),
            plan: String(row.plan),

            licenseUtilization: Number(
              row.current_license_utilization_pct
            ),

            featureAdoption: Number(
              row.current_feature_adoption_pct
            ),

            opportunityScore: Number(
              row.expansion_opportunity_score
            ),

            opportunityLevel: String(
              row.opportunity_level
            ),

            recommendedAction: String(
              row.recommended_action ??
                "Review Expansion Opportunity"
            ),
          }));

        // -----------------------------------------------------
        // FINAL RESPONSE
        // -----------------------------------------------------

        res.json({
          kpis: {
            expansionPriorityAccounts,
            arrInExpansionAccounts,
            veryHighOpportunityAccounts,
            highOpportunityAccounts,
          },

          opportunityDistribution,
          expansionDrivers,
          expansionByPlan,
          accounts: expansionAccounts,
        });
      } catch (error) {
        console.error(
          "Expansion API error:",
          error
        );

        res.status(500).json({
          error:
            "Unable to retrieve expansion opportunity data.",
        });
      } finally {
        await session.close();
      }
    });
    
  return router;
}