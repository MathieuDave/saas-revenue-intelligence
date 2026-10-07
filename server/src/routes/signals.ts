import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

const SCHEMA = "workspace.saas_revenue_intelligence";

// =========================================================
// TYPES
// =========================================================

type SignalEvent = {
  eventId: string;
  customerId: string;
  companyName: string;
  industry: string;
  companySize: string;
  signalType: string;
  direction: string; // "Risk" | "Opportunity"
  timing: string; // "Leading" | "Lagging"
  severity: string;
  description: string;
  mrrAtStake: number;
};

type Situation = {
  customerId: string;
  companyName: string;
  industry: string;
  companySize: string;
  tier: 1 | 2 | 3;
  tierLabel: string;
  mrrAtStake: number;
  signals: SignalEvent[];
};

// =========================================================
// RÈGLE MÉTIER : regrouper les signaux par client
// =========================================================

function buildSituations(events: SignalEvent[]): Situation[] {
  // 1. Un « onglet » par client
  const byCustomer = new Map<string, Situation>();

  for (const event of events) {
    let situation = byCustomer.get(event.customerId);

    if (!situation) {
      situation = {
        customerId: event.customerId,
        companyName: event.companyName,
        industry: event.industry,
        companySize: event.companySize,
        tier: 3,
        tierLabel: "",
        mrrAtStake: 0,
        signals: [],
      };
      byCustomer.set(event.customerId, situation);
    }

    situation.signals.push(event);

    // Même revenu concerné → on prend le maximum, pas la somme
    situation.mrrAtStake = Math.max(
      situation.mrrAtStake,
      event.mrrAtStake
    );
  }

  // 2. Donner un rang à chaque situation
  const situations = [...byCustomer.values()];

  for (const situation of situations) {
    const hasChurned = situation.signals.some(
      (s) => s.signalType === "Churn"
    );
    const leadingRiskCount = situation.signals.filter(
      (s) => s.direction === "Risk" && s.timing === "Leading"
    ).length;
    const hasLeadingSignal = situation.signals.some(
      (s) => s.timing === "Leading"
    );

    if (hasChurned || !hasLeadingSignal) {
      situation.tier = 3;
      situation.tierLabel = "For information";
    } else if (leadingRiskCount >= 2) {
      situation.tier = 1;
      situation.tierLabel = "Compounding risk";
    } else {
      situation.tier = 2;
      situation.tierLabel = "Actionable";
    }
  }

  // 3. Trier : rang d'abord, puis argent en jeu
  situations.sort(
    (a, b) => a.tier - b.tier || b.mrrAtStake - a.mrrAtStake
  );

  return situations;
}

// =========================================================
// ROUTE
// =========================================================

export function createSignalsRouter(
  databricks: DatabricksClient
) {
  const router = Router();

  // Exemple : GET /api/signals?month=2026-08
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
          -- 1. Les signaux actionnables (avancés) d'abord
          CASE e.signal_timing
            WHEN 'Leading' THEN 1
            ELSE 2
          END,
          -- 2. Puis par argent en jeu
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
      const events: SignalEvent[] = rows.map((row) => ({
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

      // 2. Regroupement par client (règle métier)
      const situations = buildSituations(events);

      // 3. Résumé
      const riskEvents = events.filter((e) => e.direction === "Risk");

      const summary = {
        total: events.length,
        risk: riskEvents.length,
        opportunity: events.filter((e) => e.direction === "Opportunity")
          .length,
        critical: events.filter((e) => e.severity === "Critical").length,
        situations: situations.length,
        compoundingRisk: situations.filter((s) => s.tier === 1).length,
        mrrAtRisk: riskEvents.reduce(
          (sum, event) => sum + event.mrrAtStake,
          0
        ),
      };

      res.json({ month, summary, events, situations });
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