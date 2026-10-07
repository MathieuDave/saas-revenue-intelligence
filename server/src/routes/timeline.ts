import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

const HEALTH_TABLE =
  "workspace.saas_revenue_intelligence.gold_customer_monthly_health";

export function createTimelineRouter(
  databricks: DatabricksClient
) {
  const router = Router();

  // =========================================================
  // LISTE DES MOIS DISPONIBLES (pour le bouton Play)
  // =========================================================

  router.get("/timeline/months", async (_req, res) => {
    const session = await databricks.openSession();

    try {
      const operation = await session.executeStatement(
        `
        SELECT DISTINCT DATE_FORMAT(month, 'yyyy-MM') AS month
        FROM ${HEALTH_TABLE}
        ORDER BY month
        `,
        { runAsync: true }
      );

      const rows =
        (await operation.fetchAll()) as DatabricksRow[];

      await operation.close();

      res.json(rows.map((row) => String(row.month)));
    } catch (error) {
      console.error("Timeline months API error:", error);

      res.status(500).json({
        error: "Unable to retrieve timeline months.",
      });
    } finally {
      await session.close();
    }
  });

  // =========================================================
  // ÉTAT DE L'ENTREPRISE POUR UN MOIS DONNÉ
  // Exemple : GET /api/timeline?month=2026-03
  // =========================================================

  router.get("/timeline", async (req, res) => {
    const month = String(req.query.month ?? "");

    // 1. Validation de l'entrée : format YYYY-MM obligatoire
    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({
        error:
          "Query parameter 'month' must use the format YYYY-MM (e.g. 2026-03).",
      });
      return;
    }

    const session = await databricks.openSession();

    try {
      // 2. Requête paramétrée : :month est remplacé de façon sécurisée
      const operation = await session.executeStatement(
        `
        SELECT
          COUNT_IF(ending_mrr > 0)  AS active_customers,
          SUM(ending_mrr)           AS mrr,
          SUM(new_mrr)              AS new_mrr,
          SUM(expansion_mrr)        AS expansion_mrr,
          SUM(contraction_mrr)      AS contraction_mrr,
          SUM(churn_mrr)            AS churn_mrr,
          AVG(CASE WHEN ending_mrr > 0
                   THEN license_utilization_pct END) AS avg_license_utilization,
          SUM(tickets_opened)       AS tickets_opened,
          SUM(critical_tickets)     AS critical_tickets,
          SUM(negative_feedback)    AS negative_feedback
        FROM ${HEALTH_TABLE}
        WHERE DATE_FORMAT(month, 'yyyy-MM') = :month
        `,
        {
          runAsync: true,
          namedParameters: { month },
        }
      );

      const rows =
        (await operation.fetchAll()) as DatabricksRow[];

      await operation.close();

      const row = rows[0];

      // 3. Mois absent des données → 404
      if (!row || row.mrr === null || row.mrr === undefined) {
        res.status(404).json({
          error: `No data available for month ${month}.`,
        });
        return;
      }

      res.json({
        month,
        kpis: {
          activeCustomers: Number(row.active_customers),
          mrr: Number(row.mrr),
          newMrr: Number(row.new_mrr),
          expansionMrr: Number(row.expansion_mrr),
          contractionMrr: Number(row.contraction_mrr),
          churnMrr: Number(row.churn_mrr),
          avgLicenseUtilization: Number(row.avg_license_utilization),
          ticketsOpened: Number(row.tickets_opened),
          criticalTickets: Number(row.critical_tickets),
          negativeFeedback: Number(row.negative_feedback),
        },
      });
    } catch (error) {
      console.error("Timeline API error:", error);

      res.status(500).json({
        error: "Unable to retrieve timeline data.",
      });
    } finally {
      await session.close();
    }
  });

  return router;
}