import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";
import { lastDayOfMonth } from "./brief.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

const SCHEMA = "workspace.saas_revenue_intelligence";

// =========================================================
// « DID YOUR DECISIONS WORK? »
// Les décisions prises sur le brief du mois précédent, et ce que
// chaque compte a fait depuis. On dit « depuis », jamais « grâce à » :
// les données ne contiennent aucune action humaine.
// =========================================================

// En dessous de 5 points, une variation d'usage est du bruit
// (un ou deux utilisateurs de plus ou de moins sur un petit compte)
const USAGE_CHANGE_POINTS = 5;

const MONTH = /^\d{4}-\d{2}$/;

type FollowUpStatus = "lost" | "shrank" | "worse" | "same" | "better";

// L'ordre d'affichage : d'abord ce qui demande encore l'attention du VP
const STATUS_ORDER: FollowUpStatus[] = ["lost", "shrank", "worse", "same", "better"];

type FollowUp = {
  customerId: string;
  companyName: string;
  action: string; // "delegate", "take" ou "later"
  person: string | null;
  due: string | null; // "2026-08-02"
  status: FollowUpStatus;
  utilizationBefore: number | null;
  utilizationAfter: number | null;
  usersBefore: number | null;
  usersAfter: number | null;
  revenueBefore: number | null;
  revenueAfter: number | null;
  newSignals: string[]; // signaux de RISQUE apparus le mois suivant
  newTickets: number;
  reading: string;
};

// =========================================================
// OUTILS
// =========================================================

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

// "2026-08", -1 → "2026-07"
function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

// "2026-08" → "August"
function monthName(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

function numberOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

// 12.5 → "12.5" ; 10 → "10"
function points(value: number): string {
  return String(Math.round(value * 10) / 10);
}

// =========================================================
// LES RÈGLES (évaluées dans l'ordre : la première qui s'applique gagne)
// =========================================================

function chooseStatus(f: Omit<FollowUp, "status" | "reading">): FollowUpStatus {
  // 1. Parti : plus de ligne le mois suivant, ou un revenu à zéro
  if (f.revenueAfter === null || f.revenueAfter === 0) return "lost";

  // 2. Réduit : le revenu a baissé
  if (f.revenueBefore !== null && f.revenueAfter < f.revenueBefore) return "shrank";

  const change =
    f.utilizationBefore !== null && f.utilizationAfter !== null
      ? f.utilizationAfter - f.utilizationBefore
      : 0;

  // 3. Pire : un nouveau signal de risque, ou l'usage perd 5 points ou plus
  if (f.newSignals.length > 0 || change <= -USAGE_CHANGE_POINTS) return "worse";

  // 4. Mieux : l'usage gagne 5 points ou plus, sans nouveau signal de risque
  if (change >= USAGE_CHANGE_POINTS) return "better";

  // 5. Pareil
  return "same";
}

// La phrase de lecture : elle constate, sans jamais dire « grâce à »
function buildReading(f: Omit<FollowUp, "reading">, month: string): string {
  const name = monthName(month);
  const change =
    f.utilizationBefore !== null && f.utilizationAfter !== null
      ? f.utilizationAfter - f.utilizationBefore
      : 0;
  const warning =
    f.newSignals.length > 0 ? `a new warning fired in ${name}: ${f.newSignals.join(", ")}` : null;

  switch (f.status) {
    case "lost":
      return `The customer left in ${name}.`;
    case "shrank":
      return `Revenue went down from $${f.revenueBefore} to $${f.revenueAfter} a month.`;
    case "worse":
      if (change <= -USAGE_CHANGE_POINTS) {
        return warning
          ? `Usage fell by ${points(-change)} points, and ${warning}.`
          : `Usage fell by ${points(-change)} points.`;
      }
      return `Usage held, but ${warning ?? "it did not improve"}.`;
    case "better":
      return f.newTickets === 0
        ? `Usage grew by ${points(change)} points, with no new warning and no ticket.`
        : `Usage grew by ${points(change)} points, with no new warning.`;
    case "same":
      return `Usage moved by less than ${USAGE_CHANGE_POINTS} points, with no new warning.`;
  }
}

// =========================================================
// LA REQUÊTE (validée dans Databricks : juillet → août 2026)
// =========================================================

// Exportée : la route « Put back on my desk » s'en sert pour vérifier un compte
export async function getFollowUps(databricks: DatabricksClient, month: string): Promise<FollowUp[]> {
  const sinceMonth = shiftMonth(month, -1);

  const rows = await query(
    databricks,
    `
    WITH decided AS (
      SELECT item_id AS customer_id, action, person, due_date
      FROM ${SCHEMA}.vp_decisions
      WHERE brief_month = :sinceMonth
        AND item_kind = 'risk'
    ),
    before AS (
      SELECT customer_id, license_utilization_pct AS util, active_users, ending_mrr
      FROM ${SCHEMA}.gold_customer_monthly_health
      WHERE month = CAST(:sinceStart AS TIMESTAMP)
    ),
    after AS (
      SELECT customer_id, license_utilization_pct AS util, active_users, ending_mrr
      FROM ${SCHEMA}.gold_customer_monthly_health
      WHERE month = CAST(:monthStart AS TIMESTAMP)
    ),
    new_signals AS (
      SELECT customer_id, CONCAT_WS(' | ', COLLECT_LIST(signal_type)) AS signals
      FROM ${SCHEMA}.gold_customer_signal_events
      WHERE month = CAST(:monthStart AS TIMESTAMP)
        AND signal_direction = 'Risk'
      GROUP BY customer_id
    ),
    new_tickets AS (
      SELECT customer_id, COUNT(*) AS tickets
      FROM ${SCHEMA}.support_tickets
      WHERE CAST(opened_date AS DATE) BETWEEN DATE(:monthStart) AND DATE(:monthEnd)
      GROUP BY customer_id
    )
    SELECT
      d.customer_id,
      c.company_name,
      d.action,
      d.person,
      DATE_FORMAT(d.due_date, 'yyyy-MM-dd') AS due_date,
      b.util AS util_before,
      a.util AS util_after,
      b.active_users AS users_before,
      a.active_users AS users_after,
      b.ending_mrr AS mrr_before,
      a.ending_mrr AS mrr_after,
      s.signals,
      COALESCE(t.tickets, 0) AS tickets
    FROM decided d
    JOIN ${SCHEMA}.customers c ON c.customer_id = d.customer_id
    LEFT JOIN before b ON b.customer_id = d.customer_id
    LEFT JOIN after a ON a.customer_id = d.customer_id
    LEFT JOIN new_signals s ON s.customer_id = d.customer_id
    LEFT JOIN new_tickets t ON t.customer_id = d.customer_id
    `,
    {
      sinceMonth,
      sinceStart: `${sinceMonth}-01`,
      monthStart: `${month}-01`,
      monthEnd: lastDayOfMonth(month),
    }
  );

  const followUps = rows.map((row) => {
    const signals = String(row.signals ?? "");
    const base = {
      customerId: String(row.customer_id),
      companyName: String(row.company_name),
      action: String(row.action),
      person: row.person == null ? null : String(row.person),
      due: row.due_date == null ? null : String(row.due_date),
      utilizationBefore: numberOrNull(row.util_before),
      utilizationAfter: numberOrNull(row.util_after),
      usersBefore: numberOrNull(row.users_before),
      usersAfter: numberOrNull(row.users_after),
      revenueBefore: numberOrNull(row.mrr_before),
      revenueAfter: numberOrNull(row.mrr_after),
      newSignals: signals === "" ? [] : signals.split(" | "),
      newTickets: Number(row.tickets ?? 0),
    };
    const withStatus = { ...base, status: chooseStatus(base) };
    return { ...withStatus, reading: buildReading(withStatus, month) };
  });

  // D'abord ce qui demande encore l'attention, puis par nom
  return followUps.sort(
    (x, y) =>
      STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status) ||
      x.companyName.localeCompare(y.companyName)
  );
}

// =========================================================
// ROUTE : GET /api/followups?month=2026-08
// → les décisions du brief de juillet, et ce que les comptes ont fait en août
// =========================================================

export function createFollowUpsRouter(databricks: DatabricksClient) {
  const router = Router();

  router.get("/followups", async (req, res) => {
    const month = String(req.query.month ?? "");
    if (!MONTH.test(month)) {
      res.status(400).json({ error: "'month' must look like 2026-08." });
      return;
    }

    try {
      const items = await getFollowUps(databricks, month);
      const sinceMonth = shiftMonth(month, -1);

      const tally = { lost: 0, shrank: 0, worse: 0, same: 0, better: 0 };
      for (const item of items) tally[item.status] += 1;

      res.json({
        month,
        sinceMonth,
        sinceAsOf: lastDayOfMonth(sinceMonth),
        asOf: lastDayOfMonth(month),
        tally,
        items,
      });
    } catch (error) {
      console.error("Follow-ups API error:", error);
      res.status(500).json({ error: "Unable to load the follow-ups." });
    }
  });

  return router;
}