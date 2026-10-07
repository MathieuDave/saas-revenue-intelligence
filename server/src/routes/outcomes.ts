import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";
import { getBriefSituations, lastDayOfMonth } from "./brief.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

const SCHEMA = "workspace.saas_revenue_intelligence";

// On regarde ce qui est arrivé dans les 3 mois suivant le brief
const MONTHS_AHEAD = 3;

// "2025-10" + 3 → "2026-01"
function addMonths(month: string, count: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (monthNumber ?? 1) - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

async function query(
  databricks: DatabricksClient,
  sql: string,
  namedParameters: Record<string, string>
): Promise<DatabricksRow[]> {
  const session = await databricks.openSession();
  try {
    const operation = await session.executeStatement(sql, {
      runAsync: true,
      namedParameters,
    });
    const rows = (await operation.fetchAll()) as DatabricksRow[];
    await operation.close();
    return rows;
  } finally {
    await session.close();
  }
}

type Outcome = "lost" | "shrank" | "held" | "grew";

// =========================================================
// CE QUI EST ARRIVÉ APRÈS UN BRIEF
// Les données ne contiennent aucune action humaine :
// c'est ce qui s'est passé quand personne n'a agi.
// =========================================================

export async function getOutcomes(databricks: DatabricksClient, month: string) {
  const endMonth = addMonths(month, MONTHS_AHEAD);

  // 1. Les données vont-elles assez loin pour juger ?
  const [last] = await query(
    databricks,
    `SELECT DATE_FORMAT(MAX(month), 'yyyy-MM') AS last_month
     FROM ${SCHEMA}.gold_customer_monthly_health`,
    {}
  );
  const lastMonth = String(last?.last_month ?? "");

  if (endMonth > lastMonth) {
    return { month, endMonth, available: false as const };
  }

  // 2. Les comptes signalés ce mois-là (même règle que le brief)
  const brief = await getBriefSituations(databricks, month, lastDayOfMonth(month));
  const desk = brief.today;
  const teamRisks = brief.team.filter((s) => s.leadingRisks > 0);
  const ids = [...desk, ...teamRisks].map((s) => s.customerId);

  if (ids.length === 0) {
    return { month, endMonth, available: true as const, desk: [], team: { flagged: 0, lost: 0, arrLost: 0 }, lesson: null };
  }

  // 3. Avant / après pour chacun (identifiants passés en paramètre, jamais collés)
  const rows = await query(
    databricks,
    `
    WITH ids AS (
      SELECT EXPLODE(SPLIT(:ids, ',')) AS customer_id
    )
    SELECT
      h.customer_id,
      MAX(CASE WHEN DATE_FORMAT(h.month, 'yyyy-MM') = :month    THEN h.ending_mrr END) AS mrr_before,
      MAX(CASE WHEN DATE_FORMAT(h.month, 'yyyy-MM') = :endMonth THEN h.ending_mrr END) AS mrr_after,
      MAX(CASE WHEN DATE_FORMAT(h.month, 'yyyy-MM') = :month    THEN h.license_utilization_pct END) AS util_before,
      MAX(CASE WHEN DATE_FORMAT(h.month, 'yyyy-MM') = :endMonth THEN h.license_utilization_pct END) AS util_after,
      MIN(CASE WHEN h.churn_mrr > 0
                AND DATE_FORMAT(h.month, 'yyyy-MM') >  :month
                AND DATE_FORMAT(h.month, 'yyyy-MM') <= :endMonth
               THEN DATE_FORMAT(h.month, 'yyyy-MM') END) AS churn_month
    FROM ${SCHEMA}.gold_customer_monthly_health h
    JOIN ids ON h.customer_id = ids.customer_id
    GROUP BY h.customer_id
    `,
    { ids: ids.join(","), month, endMonth }
  );

  const byId = new Map(rows.map((row) => [String(row.customer_id), row]));

  const withOutcome = <T extends { customerId: string }>(s: T) => {
    const row = byId.get(s.customerId);
    const mrrBefore = Number(row?.mrr_before ?? 0);
    const mrrAfter = Number(row?.mrr_after ?? 0);
    const churnMonth = row?.churn_month == null ? null : String(row.churn_month);

    let outcome: Outcome = "held";
    if (churnMonth) outcome = "lost";
    else if (mrrAfter > mrrBefore) outcome = "grew";
    else if (mrrAfter < mrrBefore) outcome = "shrank";

    return {
      ...s,
      outcome,
      churnMonth,
      mrrBefore,
      mrrAfter,
      utilBefore: row?.util_before == null ? null : Math.round(Number(row.util_before)),
      utilAfter: row?.util_after == null ? null : Math.round(Number(row.util_after)),
    };
  };

  const deskOutcomes = desk.map(withOutcome);
  const teamOutcomes = teamRisks.map(withOutcome);
  const teamLost = teamOutcomes.filter((s) => s.outcome === "lost");

  // Le cas dont on apprend : un compte perdu que la règle a laissé à l'équipe
  // alors qu'il renouvelait dans les 30 jours (le plus gros d'abord)
  const lesson =
    teamLost
      .filter((s) => s.daysToRenewal !== null && s.daysToRenewal <= 30)
      .sort((a, b) => b.arrAtStake - a.arrAtStake)[0] ?? null;

  return {
    month,
    endMonth,
    available: true as const,
    desk: deskOutcomes,
    team: {
      flagged: teamOutcomes.length,
      lost: teamLost.length,
      arrLost: teamLost.reduce((sum, s) => sum + s.arrAtStake, 0),
    },
    lesson,
  };
}
// =========================================================
// LE BILAN DES AGENTS SUR TOUT L'HISTORIQUE
// Parmi les clients perdus jusqu'à ce mois, combien avaient été
// signalés par un risque avancé dans les 3 mois avant leur départ ?
// =========================================================

export async function getTrackRecord(databricks: DatabricksClient, month: string) {
  const [row] = await query(
    databricks,
    `
    WITH churns AS (
      SELECT customer_id, month AS churn_month, mrr_at_stake * 12 AS arr_lost
      FROM ${SCHEMA}.gold_customer_signal_events
      WHERE signal_type = 'Churn'
        AND DATE_FORMAT(month, 'yyyy-MM') <= :month
    ),
    warnings AS (
      SELECT customer_id, month
      FROM ${SCHEMA}.gold_customer_signal_events
      WHERE signal_direction = 'Risk' AND signal_timing = 'Leading'
    ),
    churn_with_warning AS (
      SELECT
        c.customer_id,
        c.churn_month,
        c.arr_lost,
        MIN(w.month) AS first_warning
      FROM churns c
      LEFT JOIN warnings w
        ON  w.customer_id = c.customer_id
        AND w.month <  c.churn_month
        AND w.month >= ADD_MONTHS(c.churn_month, -3)
      GROUP BY c.customer_id, c.churn_month, c.arr_lost
    )
    SELECT
      COUNT(*)                                            AS churned,
      COUNT_IF(first_warning IS NOT NULL)                 AS warned,
      SUM(arr_lost)                                       AS arr_lost,
      SUM(CASE WHEN first_warning IS NOT NULL THEN arr_lost ELSE 0 END) AS arr_lost_warned,
      AVG(CASE WHEN first_warning IS NOT NULL
               THEN MONTHS_BETWEEN(churn_month, first_warning) END) AS avg_months_ahead,
      DATE_FORMAT(MIN(churn_month), 'yyyy-MM')            AS since
    FROM churn_with_warning
    `,
    { month }
  );

  const churned = Number(row?.churned ?? 0);
  const warned = Number(row?.warned ?? 0);
  const arrLost = Number(row?.arr_lost ?? 0);
  const arrLostWarned = Number(row?.arr_lost_warned ?? 0);

  return {
    month,
    since: row?.since == null ? null : String(row.since),
    churned,
    warned,
    warnedPct: churned > 0 ? Math.round((100 * warned) / churned) : 0,
    arrLostPct: arrLost > 0 ? Math.round((100 * arrLostWarned) / arrLost) : 0,
    avgMonthsAhead: Math.round(Number(row?.avg_months_ahead ?? 0) * 10) / 10,
  };
}

// =========================================================
// ROUTE : GET /api/outcomes?month=2025-10
// =========================================================

export function createOutcomesRouter(databricks: DatabricksClient) {
  const router = Router();

  router.get("/outcomes", async (req, res) => {
    const month = String(req.query.month ?? "");

    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: "'month' must look like 2025-10." });
      return;
    }

    try {
      res.json(await getOutcomes(databricks, month));
    } catch (error) {
      console.error("Outcomes API error:", error);
      res.status(500).json({ error: "Unable to compute what happened next." });
    }
  });
  // GET /api/track-record?month=2026-08 → le bilan des agents jusqu'à ce mois
  router.get("/track-record", async (req, res) => {
    const month = String(req.query.month ?? "");

    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: "'month' must look like 2026-08." });
      return;
    }

    try {
      res.json(await getTrackRecord(databricks, month));
    } catch (error) {
      console.error("Track record API error:", error);
      res.status(500).json({ error: "Unable to compute the track record." });
    }
  });

  return router;
}