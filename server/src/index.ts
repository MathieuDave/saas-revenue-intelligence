import express from "express";
import cors from "cors";

import { connectToDatabricks } from "./databricks.js";
import { askGenie } from "./genie.js";

const app = express();
const PORT = 3000;

type DatabricksRow = Record<string, unknown>;

app.use(cors());
app.use(express.json());

async function startServer() {
  try {
    /*
     * Connexion Databricks unique au démarrage.
     * On ne reconnecte PAS Databricks à chaque requête.
     */
    const databricks = await connectToDatabricks();

    // =========================================================
    // HEALTH
    // =========================================================

    app.get("/api/health", (_req, res) => {
      res.json({
        status: "ok",
        service: "SaaS Revenue Intelligence API",
      });
    });

    // =========================================================
    // EXECUTIVE OVERVIEW
    // =========================================================

    app.get("/api/overview", async (_req, res) => {
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

    // =========================================================
    // MRR TREND
    // =========================================================

    app.get("/api/revenue-trend", async (_req, res) => {
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

    // =========================================================
    // REVENUE MOVEMENTS
    // =========================================================

    app.get("/api/revenue-movements", async (_req, res) => {
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
          error: "Unable to retrieve revenue movements.",
        });
      } finally {
        await session.close();
      }
    });

    // =========================================================
    // RETENTION PRIORITIES
    // =========================================================

    app.get(
      "/api/retention-priorities",
      async (_req, res) => {
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
              daysToRenewal: Number(
                row.days_to_renewal
              ),
              riskScore: Number(
                row.revenue_risk_score
              ),
              riskLevel: row.risk_level,
              priorityCategory: row.priority_category,
              recommendedAction:
                row.recommended_action,
            }))
          );
        } catch (error) {
          console.error(
            "Retention priorities API error:",
            error
          );

          res.status(500).json({
            error:
              "Unable to retrieve retention priorities.",
          });
        } finally {
          await session.close();
        }
      }
    );

    // =========================================================
    // EXPANSION PRIORITIES
    // =========================================================

    app.get(
      "/api/expansion-priorities",
      async (_req, res) => {
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
              opportunityLevel:
                row.opportunity_level,
              recommendedAction:
                row.recommended_action,
            }))
          );
        } catch (error) {
          console.error(
            "Expansion priorities API error:",
            error
          );

          res.status(500).json({
            error:
              "Unable to retrieve expansion priorities.",
          });
        } finally {
          await session.close();
        }
      }
    );

    // =========================================================
    // CUSTOMER RISK
    // =========================================================

    app.get("/api/customer-risk", async (_req, res) => {
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

    // =========================================================
    // EXPANSION OPPORTUNITIES
    // =========================================================

    app.get("/api/expansion", async (_req, res) => {
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

        const veryHighRow =
          opportunityDistribution.find(
            (row) =>
              row.opportunityLevel === "Very High"
          );

        const highOpportunityRow =
          opportunityDistribution.find(
            (row) => row.opportunityLevel === "High"
          );

        const veryHighOpportunityAccounts =
          veryHighRow?.accounts ?? 0;

        const highOpportunityAccounts =
          highOpportunityRow?.accounts ?? 0;

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

    // =========================================================
    // CUSTOMER 360
    // =========================================================

    // =========================================================
    // CUSTOMER LIST
    // =========================================================

    app.get("/api/customers", async (_req, res) => {
      const session = await databricks.openSession();

      try {
        const operation = await session.executeStatement(
          `
          SELECT
            customer_id,
            company_name
          FROM workspace.saas_revenue_intelligence.gold_customer_opportunity_scores
          WHERE customer_status = 'Active'
          ORDER BY company_name
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
            customerId: String(row.customer_id),
            companyName: String(row.company_name),
          }))
        );
      } catch (error) {
        console.error("Customer list API error:", error);

        res.status(500).json({
          error: "Unable to retrieve customer list.",
        });
      } finally {
        await session.close();
      }
    });

    app.get("/api/customers/:customerId", async (req, res) => {
      const session = await databricks.openSession();

      try {
        const customerId = req.params.customerId;

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
        // 1. CUSTOMER PROFILE + KPI + ACTION
        // -----------------------------------------------------

                        const customerRows = await executeQuery(`
          SELECT
            o.customer_id,
            o.company_name,
            o.country,
            o.industry,
            o.company_size,
            o.employee_count,
            DATE_FORMAT(o.customer_since, 'yyyy-MM-dd') AS customer_since,
            o.customer_status,
            o.plan,
            o.seats_purchased,
            DATE_FORMAT(o.renewal_date, 'yyyy-MM-dd') AS renewal_date,
            o.days_to_renewal,
            o.current_arr,
            o.current_license_utilization_pct,
            o.expansion_opportunity_score,
            o.opportunity_level,

            a.revenue_risk_score,
            a.risk_level,
            a.priority_category,
            a.recommended_action

          FROM workspace.saas_revenue_intelligence.gold_customer_opportunity_scores o

          LEFT JOIN workspace.saas_revenue_intelligence.gold_customer_actions_explained a
            ON o.customer_id = a.customer_id

          WHERE o.customer_id = '${customerId}'

          LIMIT 1
        `);

        const customerRow = customerRows[0];

if (!customerRow) {
  return res.status(404).json({
    error: "Customer not found.",
  });
}

        // -----------------------------------------------------
        // 2. SUPPORT + FEEDBACK
        // -----------------------------------------------------

        const signalRows = await executeQuery(`
          SELECT
            tickets_last_90d,
            critical_tickets_last_90d,
            negative_feedbacks_last_90d,
            avg_score_last_90d
          FROM workspace.saas_revenue_intelligence.gold_customer_signal_profile
          WHERE customer_id = '${customerId}'
          LIMIT 1
        `);

        const signalRow = signalRows[0];

        // -----------------------------------------------------
        // 3. REVENUE HISTORY
        // -----------------------------------------------------

        const revenueRows = await executeQuery(`
          SELECT
            month,
            ending_mrr
          FROM workspace.saas_revenue_intelligence.revenue_monthly
          WHERE customer_id = '${customerId}'
          ORDER BY month
        `);

        const revenueHistory = revenueRows.map((row) => ({
          month: row.month,
          mrr: Number(row.ending_mrr),
        }));

        // -----------------------------------------------------
        // 4. PRODUCT USAGE HISTORY
        // -----------------------------------------------------

        const usageRows = await executeQuery(`
          SELECT
            month,
            license_utilization_pct
          FROM workspace.saas_revenue_intelligence.product_usage_monthly
          WHERE customer_id = '${customerId}'
          ORDER BY month
        `);

        const usageHistory = usageRows.map((row) => ({
          month: row.month,
          licenseUtilization: Number(
            row.license_utilization_pct
          ),
        }));

        // -----------------------------------------------------
        // 5. FINAL RESPONSE
        // -----------------------------------------------------

        res.json({
          customer: {
            customerId: String(customerRow.customer_id),
            companyName: String(customerRow.company_name),
          },

          kpis: {
            arr: Number(customerRow.current_arr),
            riskScore: Number(
              customerRow.revenue_risk_score ?? 0
            ),
            opportunityScore: Number(
              customerRow.expansion_opportunity_score ?? 0
            ),
            daysToRenewal: Number(
              customerRow.days_to_renewal
            ),
            licenseUtilization: Number(
              customerRow.current_license_utilization_pct
            ),
          },

          supportFeedback: {
            ticketsLast90Days: Number(
              signalRow?.tickets_last_90d ?? 0
            ),
            criticalTicketsLast90Days: Number(
              signalRow?.critical_tickets_last_90d ?? 0
            ),
            negativeFeedbackLast90Days: Number(
              signalRow?.negative_feedbacks_last_90d ?? 0
            ),
            avgFeedbackScoreLast90Days: Number(
              signalRow?.avg_score_last_90d ?? 0
            ),
          },

          revenueHistory,

          usageHistory,

          profile: {
            customerId: String(customerRow.customer_id),
            companyName: String(customerRow.company_name),
            country: String(customerRow.country ?? "N/A"),
            industry: String(customerRow.industry ?? "N/A"),
            companySize: String(
              customerRow.company_size ?? "N/A"
            ),
            employeeCount: Number(
              customerRow.employee_count ?? 0
            ),
            plan: String(customerRow.plan ?? "N/A"),
            seatsPurchased: Number(
              customerRow.seats_purchased ?? 0
            ),
            renewalDate: String(
              customerRow.renewal_date ?? "N/A"
            ),
            customerSince: String(
              customerRow.customer_since ?? "N/A"
            ),
            customerStatus: String(
              customerRow.customer_status ?? "N/A"
            ),
          },

          action: {
            priorityCategory: String(
              customerRow.priority_category ?? "Stable"
            ),
            recommendedAction: String(
              customerRow.recommended_action ??
                "No Immediate Action"
            ),
            riskLevel: String(
              customerRow.risk_level ?? "Low"
            ),
            opportunityLevel: String(
              customerRow.opportunity_level ?? "Low"
            ),
          },
        });
      } catch (error) {
        console.error(
          "Customer 360 API error:",
          error
        );

        res.status(500).json({
          error:
            "Unable to retrieve customer 360 data.",
        });
      } finally {
        await session.close();
      }
    });

    // =========================================================
    // START EXPRESS
    // =========================================================
app.post("/api/genie/chat", async (req, res) => {
  try {
    const { question, conversationId } = req.body as {
  question?: string;
  conversationId?: string;
};

    if (!question?.trim()) {
      return res.status(400).json({
        error: "Question is required",
      });
    }

    const result = await askGenie(
  question.trim(),
  conversationId
);

    return res.json(result);
  } catch (error) {
    console.error("Genie error:", error);

    return res.status(500).json({
      error: "Unable to get a response from Genie",
    });
  }
});

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