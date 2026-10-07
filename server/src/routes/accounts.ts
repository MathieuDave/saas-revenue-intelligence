import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

const SCHEMA = "workspace.saas_revenue_intelligence";

// =========================================================
// RÉGLAGES
// =========================================================

const HISTORY_MONTHS = 6; // la courbe du tiroir : 6 mois
const MEANINGFUL_DROP = 10; // en points : en dessous, on ne parle pas de « chute »

const CUSTOMER_ID = /^C\d{4}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// =========================================================
// LA FORME DE LA RÉPONSE
// =========================================================

type MonthPoint = {
  month: string; // "2026-08"
  utilizationPct: number;
  activeUsers: number;
  licensedSeats: number;
  monthlyRevenue: number;
  signals: string[];
  tickets: number;
  feedback: number;
};

type AccountEvent = {
  date: string; // "2026-08-20"
  kind: "ticket" | "feedback";
  title: string; // "High · Performance" ou "2 out of 5"
  category: string | null; // tickets seulement : "Authentication"
  detail: string; // statut du ticket, ou sentiment du feedback
  comment: string | null;
};

// =========================================================
// OUTIL : exécuter une requête paramétrée
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

// =========================================================
// DATES
// =========================================================

// "2026-08-31", 6 → "2026-03-01" (le 1er jour du plus vieux mois de la courbe)
function historyStart(asOf: string, months: number): string {
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7)); // 1 à 12
  const first = new Date(Date.UTC(year, month - months, 1));
  return first.toISOString().slice(0, 10);
}

// "2026-05" → "May"
function monthName(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

// =========================================================
// LES TROIS REQUÊTES (elles partent en même temps)
// =========================================================

// Qui est le client, ce qu'il paie au mois du brief, et son prochain renouvellement
async function getProfile(databricks: DatabricksClient, customerId: string, asOf: string) {
  const rows = await query(
    databricks,
    `
    WITH renewals AS (
      SELECT
        ADD_MONTHS(
          contract_start_date,
          12 * (YEAR(DATE(:asOf)) - YEAR(contract_start_date))
        ) AS anniversary
      FROM ${SCHEMA}.subscriptions
      WHERE customer_id = :customerId
    ),
    next_renewal AS (
      SELECT MIN(
        CASE
          WHEN anniversary > DATE(:asOf) THEN anniversary
          ELSE ADD_MONTHS(anniversary, 12)
        END
      ) AS next_renewal
      FROM renewals
    )
    SELECT
      c.customer_id,
      c.company_name,
      c.industry,
      c.company_size,
      h.ending_mrr,
      h.licensed_seats,
      h.active_users,
      h.license_utilization_pct,
      DATE_FORMAT(n.next_renewal, 'yyyy-MM-dd') AS next_renewal,
      DATEDIFF(n.next_renewal, DATE(:asOf)) AS days_to_renewal
    FROM ${SCHEMA}.customers c
    CROSS JOIN next_renewal n
    LEFT JOIN ${SCHEMA}.gold_customer_monthly_health h
      ON h.customer_id = c.customer_id
     AND h.month = DATE_TRUNC('MONTH', CAST(:asOf AS TIMESTAMP))
    WHERE c.customer_id = :customerId
    `,
    { customerId, asOf }
  );

  return rows[0] ?? null;
}

// La courbe : un point par mois, avec les signaux déclenchés ce mois-là
async function getHistory(
  databricks: DatabricksClient,
  customerId: string,
  asOf: string,
  start: string
) {
  return query(
    databricks,
    `
    SELECT
      DATE_FORMAT(h.month, 'yyyy-MM') AS month,
      h.license_utilization_pct,
      h.active_users,
      h.licensed_seats,
      h.ending_mrr,
      CONCAT_WS(' | ', COLLECT_LIST(s.signal_type)) AS signals
    FROM ${SCHEMA}.gold_customer_monthly_health h
    LEFT JOIN ${SCHEMA}.gold_customer_signal_events s
      ON s.customer_id = h.customer_id
     AND s.month = h.month
    WHERE h.customer_id = :customerId
      AND h.month BETWEEN CAST(:start AS TIMESTAMP) AND CAST(:asOf AS TIMESTAMP)
    GROUP BY h.month, h.license_utilization_pct, h.active_users, h.licensed_seats, h.ending_mrr
    ORDER BY h.month
    `,
    { customerId, asOf, start }
  );
}

// La chronologie : tickets et feedbacks de la même période, du plus récent au plus ancien
async function getEvents(
  databricks: DatabricksClient,
  customerId: string,
  asOf: string,
  start: string
) {
  return query(
    databricks,
    `
    SELECT
      DATE_FORMAT(opened_date, 'yyyy-MM-dd') AS event_date,
      'ticket' AS kind,
      CONCAT(severity, ' · ', category) AS title,
      category,
      status AS detail,
      CAST(NULL AS STRING) AS comment
    FROM ${SCHEMA}.support_tickets
    WHERE customer_id = :customerId
      AND CAST(opened_date AS DATE) BETWEEN DATE(:start) AND DATE(:asOf)

    UNION ALL

    SELECT
      DATE_FORMAT(feedback_date, 'yyyy-MM-dd') AS event_date,
      'feedback' AS kind,
      CONCAT(score, ' out of 5') AS title,
      CAST(NULL AS STRING) AS category,
      sentiment AS detail,
      comment
    FROM ${SCHEMA}.customer_feedback
    WHERE customer_id = :customerId
      AND CAST(feedback_date AS DATE) BETWEEN DATE(:start) AND DATE(:asOf)

    ORDER BY event_date DESC
    `,
    { customerId, asOf, start }
  );
}

// =========================================================
// LA PHRASE DE LECTURE (option A : une règle, jamais d'invention)
// Elle constate ce qui arrive en même temps ; elle ne dit pas « à cause de ».
// =========================================================

export function buildReading(history: MonthPoint[], events: AccountEvent[]): string | null {
  const last = history[history.length - 1];
  if (!last || history.length < 3) return null;

  // On remonte depuis le dernier mois tant que l'usage ne remontait pas
  let start = history.length - 1;
  while (start > 0) {
    const before = history[start - 1];
    const current = history[start];
    if (!before || !current || current.utilizationPct > before.utilizationPct) break;
    start -= 1;
  }

  // Sur un plateau en haut (73,7 % puis 73,7 %), le sommet est le DERNIER mois du plateau
  while (start < history.length - 1) {
    const current = history[start];
    const next = history[start + 1];
    if (!current || !next || next.utilizationPct !== current.utilizationPct) break;
    start += 1;
  }

  // start = le dernier sommet ; la chute commence le mois suivant
  const peak = history[start];
  const firstDown = history[start + 1];
  if (!peak || !firstDown || peak.utilizationPct - last.utilizationPct < MEANINGFUL_DROP) {
    return null;
  }

  const parts: string[] = [];

  // 1. Quand la chute a commencé, et ce qui s'est passé ce mois-là
  const ticketsThatMonth = events.filter(
    (e) => e.kind === "ticket" && e.date.startsWith(firstDown.month)
  );
  const categories = [...new Set(ticketsThatMonth.map((e) => e.category ?? "support"))];
  let opening = `Seat usage started falling in ${monthName(firstDown.month)}`;
  if (ticketsThatMonth.length > 0) {
    const what =
      categories.length === 1
        ? `${categories[0]?.toLowerCase()} ${ticketsThatMonth.length === 1 ? "ticket" : "tickets"}`
        : `support ${ticketsThatMonth.length === 1 ? "ticket" : "tickets"}`;
    opening += `, the month of ${ticketsThatMonth.length} ${what}`;
  }
  parts.push(`${opening}.`);

  // 2. Le premier signal des agents depuis le début de la chute
  const firstSignal = history.slice(start + 1).find((m) => m.signals.length > 0);
  if (firstSignal) {
    const lag = history.indexOf(firstSignal) - (start + 1);
    const when = monthName(firstSignal.month);
    parts.push(
      lag > 0
        ? `Your agents' first signal came in ${when}, ${lag} ${lag === 1 ? "month" : "months"} later.`
        : `Your agents flagged it in ${when}.`
    );
  }

  return parts.join(" ");
}

// =========================================================
// ROUTE : GET /api/accounts/C1367/evidence?asOf=2026-08-31
// =========================================================

export function createAccountsRouter(databricks: DatabricksClient) {
  const router = Router();

  router.get("/accounts/:customerId/evidence", async (req, res) => {
    const customerId = String(req.params.customerId ?? "");
    const asOf = String(req.query.asOf ?? "");

    if (!CUSTOMER_ID.test(customerId)) {
      res.status(400).json({ error: "'customerId' must look like C1367." });
      return;
    }
    if (!DATE.test(asOf)) {
      res.status(400).json({ error: "'asOf' must look like 2026-08-31." });
      return;
    }

    const start = historyStart(asOf, HISTORY_MONTHS);

    try {
      const [profile, historyRows, eventRows] = await Promise.all([
        getProfile(databricks, customerId, asOf),
        getHistory(databricks, customerId, asOf, start),
        getEvents(databricks, customerId, asOf, start),
      ]);

      if (!profile) {
        res.status(404).json({ error: `No customer found with id ${customerId}.` });
        return;
      }

      const events: AccountEvent[] = eventRows.map((row) => ({
        date: String(row.event_date),
        kind: row.kind === "feedback" ? "feedback" : "ticket",
        title: String(row.title),
        category: row.category == null ? null : String(row.category),
        detail: String(row.detail ?? ""),
        comment: row.comment == null ? null : String(row.comment),
      }));

      // Chaque mois de la courbe sait combien de tickets et de feedbacks il contient
      const history: MonthPoint[] = historyRows.map((row) => {
        const month = String(row.month);
        const signals = String(row.signals ?? "");
        return {
          month,
          utilizationPct: Number(row.license_utilization_pct ?? 0),
          activeUsers: Number(row.active_users ?? 0),
          licensedSeats: Number(row.licensed_seats ?? 0),
          monthlyRevenue: Number(row.ending_mrr ?? 0),
          signals: signals === "" ? [] : signals.split(" | "),
          tickets: events.filter((e) => e.kind === "ticket" && e.date.startsWith(month)).length,
          feedback: events.filter((e) => e.kind === "feedback" && e.date.startsWith(month)).length,
        };
      });

      const monthlyRevenue = Number(profile.ending_mrr ?? 0);

      res.json({
        customerId,
        companyName: String(profile.company_name),
        industry: String(profile.industry),
        companySize: String(profile.company_size),
        asOf,
        arr: monthlyRevenue * 12,
        monthlyRevenue,
        licensedSeats: Number(profile.licensed_seats ?? 0),
        activeUsers: Number(profile.active_users ?? 0),
        utilizationPct: Number(profile.license_utilization_pct ?? 0),
        nextRenewal: profile.next_renewal == null ? null : String(profile.next_renewal),
        daysToRenewal: profile.days_to_renewal == null ? null : Number(profile.days_to_renewal),
        history,
        events,
        reading: buildReading(history, events),
      });
    } catch (error) {
      console.error("Accounts API error (evidence):", error);
      res.status(500).json({ error: "Unable to load the account data." });
    }
  });

  return router;
}