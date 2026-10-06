import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

export function createRiskRouter(
  databricks: DatabricksClient
) {
  const router = Router();

 // =========================================================
    // CUSTOMER RISK
    // =========================================================

    router.get("/customer-risk", async (_req, res) => {
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
        // 1. RISK DISTRIBUTION + ARR
        // -----------------------------------------------------

        const distributionRows = await executeQuery(`
          SELECT
            risk_level,
            COUNT(*) AS accounts,
            SUM(current_arr) AS arr
          FROM workspace.saas_revenue_intelligence.gold_customer_risk_scores
          GROUP BY risk_level
          ORDER BY
            CASE risk_level
              WHEN 'Critical' THEN 1
              WHEN 'High' THEN 2
              WHEN 'Moderate' THEN 3
              WHEN 'Low' THEN 4
              ELSE 5
            END
        `);

        const riskDistribution = distributionRows.map(
          (row) => ({
            riskLevel: String(row.risk_level),
            accounts: Number(row.accounts),
            arr: Number(row.arr),
          })
        );

        // -----------------------------------------------------
        // 2. KPI
        // -----------------------------------------------------

        const criticalRow = riskDistribution.find(
          (row) => row.riskLevel === "Critical"
        );

        const highRow = riskDistribution.find(
          (row) => row.riskLevel === "High"
        );

        const criticalAccounts =
          criticalRow?.accounts ?? 0;

        const highRiskAccounts =
          highRow?.accounts ?? 0;

        const priorityArrAtRisk =
          (criticalRow?.arr ?? 0) +
          (highRow?.arr ?? 0);

        const renewalRows = await executeQuery(`
          SELECT
            COUNT(*) AS renewals_next_30_days
          FROM workspace.saas_revenue_intelligence.gold_customer_risk_scores
          WHERE days_to_renewal BETWEEN 0 AND 30
        `);

        const renewalsNext30Days = Number(
          renewalRows[0]?.renewals_next_30_days ?? 0
        );

        // -----------------------------------------------------
        // 3. PRIMARY RISK DRIVERS
        // -----------------------------------------------------

        const driverRows = await executeQuery(`
          SELECT
            SUM(usage_risk_points) AS usage_points,
            SUM(support_risk_points) AS support_points,
            SUM(renewal_risk_points) AS renewal_points,
            SUM(feedback_risk_points) AS feedback_points
          FROM workspace.saas_revenue_intelligence.gold_customer_risk_scores
          WHERE risk_level IN ('Critical', 'High')
        `);

        const driverRow = driverRows[0];

        const riskDrivers = [
          {
            driver: "Usage Decline",
            points: Number(
              driverRow?.usage_points ?? 0
            ),
          },
          {
            driver: "Support",
            points: Number(
              driverRow?.support_points ?? 0
            ),
          },
          {
            driver: "Renewal",
            points: Number(
              driverRow?.renewal_points ?? 0
            ),
          },
          {
            driver: "Feedback",
            points: Number(
              driverRow?.feedback_points ?? 0
            ),
          },
        ];

        // -----------------------------------------------------
        // 4. RENEWAL URGENCY
        // -----------------------------------------------------

        const renewalUrgencyRows = await executeQuery(`
          SELECT
            CASE
              WHEN days_to_renewal BETWEEN 0 AND 30
                THEN '0-30 days'
              WHEN days_to_renewal BETWEEN 31 AND 60
                THEN '31-60 days'
              WHEN days_to_renewal BETWEEN 61 AND 90
                THEN '61-90 days'
            END AS renewal_range,
            COUNT(*) AS accounts
          FROM workspace.saas_revenue_intelligence.gold_customer_risk_scores
          WHERE days_to_renewal BETWEEN 0 AND 90
          GROUP BY
            CASE
              WHEN days_to_renewal BETWEEN 0 AND 30
                THEN '0-30 days'
              WHEN days_to_renewal BETWEEN 31 AND 60
                THEN '31-60 days'
              WHEN days_to_renewal BETWEEN 61 AND 90
                THEN '61-90 days'
            END
          ORDER BY
            CASE renewal_range
              WHEN '0-30 days' THEN 1
              WHEN '31-60 days' THEN 2
              WHEN '61-90 days' THEN 3
              ELSE 4
            END
        `);

        const renewalUrgency = renewalUrgencyRows.map(
          (row) => ({
            range: String(row.renewal_range),
            accounts: Number(row.accounts),
          })
        );

        // -----------------------------------------------------
        // 5. ACCOUNTS REQUIRING ATTENTION
        // -----------------------------------------------------

        const accountRows = await executeQuery(`
          SELECT
            r.company_name,
            r.current_arr,
            r.revenue_risk_score,
            r.risk_level,
            r.days_to_renewal,
            r.usage_risk_points,
            r.support_risk_points,
            r.renewal_risk_points,
            r.feedback_risk_points,
            a.recommended_action
          FROM workspace.saas_revenue_intelligence.gold_customer_risk_scores r
          LEFT JOIN workspace.saas_revenue_intelligence.gold_customer_actions_explained a
            ON r.customer_id = a.customer_id
          WHERE r.risk_level IN ('Critical', 'High')
          ORDER BY
            r.revenue_risk_score DESC,
            r.current_arr DESC
        `);

        const accounts = accountRows.map((row) => {
          const drivers = [
  {
    name: "Usage Decline",
    ratio:
      Number(row.usage_risk_points ?? 0) / 35,
  },
  {
    name: "Support",
    ratio:
      Number(row.support_risk_points ?? 0) / 25,
  },
  {
    name: "Renewal",
    ratio:
      Number(row.renewal_risk_points ?? 0) / 20,
  },
  {
    name: "Feedback",
    ratio:
      Number(row.feedback_risk_points ?? 0) / 20,
  },
];

const primaryRiskDriver = drivers.reduce(
  (highest, current) =>
    current.ratio > highest.ratio
      ? current
      : highest
).name;

          return {
            companyName: String(row.company_name),
            arr: Number(row.current_arr),
            riskScore: Number(
              row.revenue_risk_score
            ),
            riskLevel: String(row.risk_level),
            daysToRenewal: Number(
              row.days_to_renewal
            ),
            primaryRiskDriver,
            recommendedAction: String(
              row.recommended_action ??
                "Review Account"
            ),
          };
        });

        res.json({
          kpis: {
            priorityArrAtRisk,
            criticalAccounts,
            highRiskAccounts,
            renewalsNext30Days,
          },
          riskDistribution,
          riskDrivers,
          renewalUrgency,
          accounts,
        });
      } catch (error) {
        console.error(
          "Customer risk API error:",
          error
        );

        res.status(500).json({
          error:
            "Unable to retrieve customer risk data.",
        });
      } finally {
        await session.close();
      }
    });

  return router;
}