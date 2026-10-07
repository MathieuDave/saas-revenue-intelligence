import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

const SCHEMA = "workspace.saas_revenue_intelligence";

export function createSignalsRouter(
  databricks: DatabricksClient
) {
  const router = Router();

  // =========================================================
  // ÉVÉNEMENTS D'UN MOIS DONNÉ
  // Exemple : GET /api/signals?month=2026-08
  // =========================================================

  router.get("/signals", async (req, res) => {
    const month = String(req.query.month ?? "");

    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({
        error:
          "Query parameter 'month' must use the format YYYY-MM (e.g. 2026-03).",
      });
      return;
    }

    const session = await databricks.openSession();

    try {
      const operation = await session.executeStatement(
        `
        SELECT
          e.event_id,
          e.customer_id,
          c.company_name,
          c.industry,
          c.company_size,
          e.signal_type,
          e.signal_direction,
          e.signal_timing,
          e.severity,
          e.description,
          e.mrr_at_stake
        FROM ${SCHEMA}.gold_customer_signal_events e
        LEFT JOIN ${SCHEMA}.customers c
          ON e.customer_id = c.customer_id
        WHERE DATE_FORMAT(e.month, 'yyyy-MM') = :month
        ORDER BY
          CASE e.severity
            WHEN 'Critical' THEN 1
            WHEN 'High'     THEN 2
            WHEN 'Medium'   THEN 3
            ELSE 4
          END,
          e.mrr_at_stake DESC
        `,
        {
          runAsync: true,
          namedParameters: { month },
        }
      );

      const rows =
        (await operation.fetchAll()) as DatabricksRow[];

      await operation.close();

      // 1. Mise en forme de chaque événement
      const events = rows.map((row) => ({
        eventId: String(row.event_id),
        customerId: String(row.customer_id),
        companyName: String(row.company_name ?? row.customer_id),
        industry: String(row.industry ?? ""),
        companySize: String(row.company_size ?? ""),
        signalType: String(row.signal_type),
        direction: String(row.signal_direction),
        timing: String(row.signal_timing),
        severity: String(row.severity),
        description: String(row.description),
        mrrAtStake: Number(row.mrr_at_stake ?? 0),
      }));

      // 2. Résumé calculé côté backend, sans nouvelle requête
      const riskEvents = events.filter(
        (event) => event.direction === "Risk"
      );
      const opportunityEvents = events.filter(
        (event) => event.direction === "Opportunity"
      );

      const summary = {
        total: events.length,
        risk: riskEvents.length,
        opportunity: opportunityEvents.length,
        critical: events.filter((e) => e.severity === "Critical").length,
        mrrAtRisk: riskEvents.reduce(
          (sum, event) => sum + event.mrrAtStake,
          0
        ),
      };

      // 3. Un mois sans événement = 200 avec une liste vide (pas une erreur)
      res.json({ month, summary, events });
    } catch (error) {
      console.error("Signals API error:", error);

      res.status(500).json({
        error: "Unable to retrieve signal events.",
      });
    } finally {
      await session.close();
    }
  });

  return router;
}