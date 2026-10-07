import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";
import { runAccountChat, type ChatTurn } from "../agents/accountChat.js";
import { AS_OF_DATE } from "../agents/tools.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

const SCHEMA = "workspace.saas_revenue_intelligence";

// =========================================================
// RÉGLAGES
// =========================================================

const HISTORY_MONTHS = 6; // la courbe du tiroir : 6 mois
const MEANINGFUL_DROP = 10; // en points : en dessous, on ne parle pas de « chute »

const MAX_TURNS = 12; // la conversation envoyée par le navigateur : 12 messages au plus
const MAX_QUESTION_CHARS = 1000;

const CUSTOMER_ID = /^C\d{4}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// =========================================================
// LA FORME DE LA RÉPONSE
// =========================================================

export type MonthPoint = {
  month: string; // "2026-08"
  utilizationPct: number;
  activeUsers: number;
  licensedSeats: number;
  monthlyRevenue: number;
  signals: string[];
  tickets: number;
  feedback: number;
};

export type AccountEvent = {
  date: string; // "2026-08-20"
  kind: "ticket" | "feedback";
  title: string; // "High · Performance" ou "2 out of 5"
  category: string | null; // tickets seulement : "Authentication"
  detail: string; // statut du ticket, ou sentiment du feedback
  comment: string | null;
  ageDays: number | null; // tickets seulement : jours entre l'ouverture et la date du brief
};

// Ce que les agents ont vu : un signal, avec sa propre phrase
export type AccountSignal = {
  month: string; // "2026-08"
  type: string; // "Usage Drop"
  direction: string; // "Risk" ou "Opportunity"
  severity: string;
  description: string; // "License utilization fell to 26% vs a 3-month average of 56%"
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

// ["a", "b", "c"] → "a, b and c"
function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// "2026-05" → "May"
function monthName(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

// =========================================================
// LES QUATRE REQUÊTES (elles partent en même temps)
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
      CAST(NULL AS STRING) AS comment,
      DATEDIFF(DATE(:asOf), CAST(opened_date AS DATE)) AS age_days
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
      comment,
      CAST(NULL AS INT) AS age_days
    FROM ${SCHEMA}.customer_feedback
    WHERE customer_id = :customerId
      AND CAST(feedback_date AS DATE) BETWEEN DATE(:start) AND DATE(:asOf)

    ORDER BY event_date DESC
    `,
    { customerId, asOf, start }
  );
}

// Les signaux de la période, avec la phrase écrite par le moteur de signaux
async function getSignals(
  databricks: DatabricksClient,
  customerId: string,
  asOf: string,
  start: string
) {
  return query(
    databricks,
    `
    SELECT
      DATE_FORMAT(month, 'yyyy-MM') AS month,
      signal_type,
      signal_direction,
      severity,
      description
    FROM ${SCHEMA}.gold_customer_signal_events
    WHERE customer_id = :customerId
      AND month BETWEEN CAST(:start AS TIMESTAMP) AND CAST(:asOf AS TIMESTAMP)
    ORDER BY month DESC, signal_type
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
  const categories = [
    ...new Set(ticketsThatMonth.map((e) => (e.category ?? "support").toLowerCase())),
  ];
  const n = ticketsThatMonth.length;
  let opening = `Seat usage started falling in ${monthName(firstDown.month)}`;
  if (n > 0) {
    // Une seule catégorie : « 2 authentication tickets » ; plusieurs : « 2 tickets, about billing and dashboards »
    opening +=
      categories.length === 1
        ? `, the month of ${n} ${categories[0]} ${n === 1 ? "ticket" : "tickets"}`
        : `, the month of ${n} tickets about ${joinWords(categories)}`;
  }
  parts.push(`${opening}.`);

  // 2. Le premier signal des agents depuis le début de la chute
  const firstSignal = history.slice(start + 1).find((m) => m.signals.length > 0);
  if (firstSignal) {
    const lag = history.indexOf(firstSignal) - (start + 1);
    const when = monthName(firstSignal.month);
    const which = joinWords(firstSignal.signals);
    parts.push(
      lag > 0
        ? `Your agents' first signal came in ${when}, ${lag} ${lag === 1 ? "month" : "months"} later: ${which}.`
        : `Your agents flagged it in ${when}: ${which}.`
    );
  }

  return parts.join(" ");
}

// =========================================================
// LE DOSSIER DU COMPTE : tout ce que montre le tiroir
// Utilisé par la route du tiroir ET donné à l'agent de conversation.
// =========================================================

export type AccountEvidence = {
  customerId: string;
  companyName: string;
  industry: string;
  companySize: string;
  asOf: string;
  arr: number;
  monthlyRevenue: number;
  licensedSeats: number;
  activeUsers: number;
  utilizationPct: number;
  nextRenewal: string | null;
  daysToRenewal: number | null;
  history: MonthPoint[];
  events: AccountEvent[];
  signals: AccountSignal[];
  reading: string | null;
};

export async function getAccountEvidence(
  databricks: DatabricksClient,
  customerId: string,
  asOf: string
): Promise<AccountEvidence | null> {
  const start = historyStart(asOf, HISTORY_MONTHS);

  const [profile, historyRows, eventRows, signalRows] = await Promise.all([
    getProfile(databricks, customerId, asOf),
    getHistory(databricks, customerId, asOf, start),
    getEvents(databricks, customerId, asOf, start),
    getSignals(databricks, customerId, asOf, start),
  ]);

  if (!profile) return null;

  const events: AccountEvent[] = eventRows.map((row) => ({
    date: String(row.event_date),
    kind: row.kind === "feedback" ? "feedback" : "ticket",
    title: String(row.title),
    category: row.category == null ? null : String(row.category),
    detail: String(row.detail ?? ""),
    comment: row.comment == null ? null : String(row.comment),
    ageDays: row.age_days == null ? null : Number(row.age_days),
  }));

  const signals: AccountSignal[] = signalRows.map((row) => ({
    month: String(row.month),
    type: String(row.signal_type),
    direction: String(row.signal_direction),
    severity: String(row.severity),
    description: String(row.description ?? ""),
  }));

  // Chaque mois de la courbe sait combien de tickets et de feedbacks il contient
  const history: MonthPoint[] = historyRows.map((row) => {
    const month = String(row.month);
    const monthSignals = String(row.signals ?? "");
    return {
      month,
      utilizationPct: Number(row.license_utilization_pct ?? 0),
      activeUsers: Number(row.active_users ?? 0),
      licensedSeats: Number(row.licensed_seats ?? 0),
      monthlyRevenue: Number(row.ending_mrr ?? 0),
      signals: monthSignals === "" ? [] : monthSignals.split(" | "),
      tickets: events.filter((e) => e.kind === "ticket" && e.date.startsWith(month)).length,
      feedback: events.filter((e) => e.kind === "feedback" && e.date.startsWith(month)).length,
    };
  });

  const monthlyRevenue = Number(profile.ending_mrr ?? 0);

  return {
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
    signals,
    reading: buildReading(history, events),
  };
}

// =========================================================
// LA CONVERSATION ENVOYÉE PAR LE NAVIGATEUR
// On ne fait jamais confiance au client : tout est vérifié.
// =========================================================

// La date du brief envoyée avec la question (par défaut : la fin des données)
function readAsOf(body: unknown): string | null {
  const value =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>).asOf : undefined;
  if (value === undefined) return AS_OF_DATE;
  return typeof value === "string" && DATE.test(value) ? value : null;
}

function validateConversation(body: unknown): ChatTurn[] | string {
  if (typeof body !== "object" || body === null) return "The body must be a JSON object.";
  const messages = (body as Record<string, unknown>).messages;

  if (!Array.isArray(messages) || messages.length === 0) return "'messages' must be a non-empty list.";
  if (messages.length > MAX_TURNS) return `A conversation is limited to ${MAX_TURNS} messages.`;

  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (typeof m !== "object" || m === null) return "Each message must be an object.";
    const { role, content } = m as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") return "'role' must be 'user' or 'assistant'.";
    if (typeof content !== "string" || content.trim() === "") return "Each message needs some text.";
    if (role === "user" && content.length > MAX_QUESTION_CHARS) {
      return `A question is limited to ${MAX_QUESTION_CHARS} characters.`;
    }
    turns.push({ role, content: content.trim() });
  }

  if (turns[turns.length - 1]?.role !== "user") return "The last message must be a question.";
  return turns;
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

    try {
      const evidence = await getAccountEvidence(databricks, customerId, asOf);
      if (!evidence) {
        res.status(404).json({ error: `No customer found with id ${customerId}.` });
        return;
      }
      res.json(evidence);
    } catch (error) {
      console.error("Accounts API error (evidence):", error);
      res.status(500).json({ error: "Unable to load the account data." });
    }
  });

  // =========================================================
  // ROUTE : POST /api/accounts/C1367/ask  (réponse en flux SSE)
  // Body : { asOf: "2026-08-31", messages: [{ role: "user", content: "Why did usage fall?" }, ...] }
  // =========================================================

  router.post("/accounts/:customerId/ask", async (req, res) => {
    const customerId = String(req.params.customerId ?? "");
    if (!CUSTOMER_ID.test(customerId)) {
      res.status(400).json({ error: "'customerId' must look like C1367." });
      return;
    }

    // 1. Vérifier AVANT d'appeler le modèle (chaque appel coûte des jetons)
    const conversation = validateConversation(req.body);
    if (typeof conversation === "string") {
      res.status(400).json({ error: conversation });
      return;
    }

    const asOf = readAsOf(req.body);
    if (!asOf) {
      res.status(400).json({ error: "'asOf' must look like 2026-08-31." });
      return;
    }

    // 2. Le dossier du compte, à la date du brief : l'agent le reçoit AVANT de répondre
    let evidence: AccountEvidence | null;
    try {
      evidence = await getAccountEvidence(databricks, customerId, asOf);
    } catch (error) {
      console.error("Account chat error (evidence):", error);
      res.status(500).json({ error: "Unable to load the account data." });
      return;
    }
    if (!evidence) {
      res.status(404).json({ error: `No customer found with id ${customerId}.` });
      return;
    }

    // 3. Ouvrir le flux : les étapes partent vers le navigateur au fil de l'eau
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let closed = false;
    res.on("close", () => {
      closed = true;
    });

    function send(eventName: string, data: unknown) {
      if (closed) return;
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    try {
      const result = await runAccountChat(databricks, evidence, conversation, (step) =>
        send("step", step)
      );
      send("answer", { text: result.answer });
      console.log(
        `Account chat for ${customerId}: ${result.steps} steps, ${result.totalTokens} tokens`
      );
    } catch (error) {
      console.error("Account chat error:", error);
      send("error", { message: "The Account Analyst could not answer. Please try again." });
    } finally {
      send("done", {});
      if (!closed) res.end();
    }
  });

  return router;
}