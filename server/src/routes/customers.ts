import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

export function createCustomersRouter(
  databricks: DatabricksClient
) {
  const router = Router();
// =========================================================
    // CUSTOMER LIST
    // =========================================================

    router.get("/customers", async (_req, res) => {
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

// =========================================================
    // CUSTOMER 360
    // =========================================================

    router.get("/customers/:customerId", async (req, res) => {
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

  return router;
}