import { Router } from "express";

import type { connectToDatabricks } from "../databricks.js";

type DatabricksClient =
  Awaited<ReturnType<typeof connectToDatabricks>>;

type DatabricksRow = Record<string, unknown>;

const SCHEMA = "workspace.saas_revenue_intelligence";

// =========================================================
// RÉGLAGES MÉTIER (décisions M2a et M2b)
// =========================================================

// Objectif = moyenne des 4 derniers trimestres complets + 10 %
const GOAL_GROWTH = 0.1;
const QUARTERS_FOR_GOAL = 4;

// Règle de répartition v2 (validée par SQL sur août 2026)
const VP_ARR_THRESHOLD = 25_000; // ARR en jeu qui justifie le VP
const URGENT_ARR_THRESHOLD = 10_000; // plus petit compte, mais renouvellement imminent
const URGENT_RENEWAL_DAYS = 14;
const COMPOUNDING_RENEWAL_DAYS = 30;

// Renouvellements du trimestre suivant (décision du 7 oct. 2026, option A)
const RISK_LOOKBACK_MONTHS = 3; // un risque avancé dans les 3 derniers mois
const KEY_RENEWAL_ARR = 10_000; // au-dessus : le VP voit le compte par son nom

// L'équipe du VP (fictive) — même équipe que dans le prompt de l'agent
export const TEAM = [
  { name: "Julie Tremblay", role: "CSM · Enterprise" },
  { name: "Marc Gagnon", role: "CSM · Small & Mid-Market" },
  { name: "Sofia Ramirez", role: "Account Executive · Expansion" },
  { name: "David Chen", role: "Head of Product" },
] as const;

type TeamMemberName = (typeof TEAM)[number]["name"];

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

// "2026-08" → "2026-08-31"
export function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 0));
  return date.toISOString().slice(0, 10);
}

// "2026-08" + 2 → "2026-10"  ;  "2026-08" - 2 → "2026-06"
function addMonths(month: string, count: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (monthNumber ?? 1) - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

// "2026-08" → { label: "2026-Q4", from: "2026-10-01", to: "2026-12-31" }
function nextQuarterOf(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const quarterEndMonth = Math.ceil((monthNumber ?? 1) / 3) * 3;
  const start = addMonths(
    `${year}-${String(quarterEndMonth).padStart(2, "0")}`,
    1
  );
  const end = addMonths(start, 2);
  const [startYear, startMonth] = start.split("-").map(Number);

  return {
    label: `${startYear}-Q${Math.ceil((startMonth ?? 1) / 3)}`,
    from: `${start}-01`,
    to: lastDayOfMonth(end),
  };
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Math.round(ms / 86_400_000);
}

// =========================================================
// PARTIE 1 : OBJECTIF DU TRIMESTRE (M2a)
// =========================================================

export async function getQuarterGoal(
  databricks: DatabricksClient,
  month: string
) {
  const rows = await query(
    databricks,
    `
    SELECT
      YEAR(month)    AS year,
      QUARTER(month) AS quarter,
      COUNT(*)       AS months,
      SUM(new_mrr + expansion_mrr - contraction_mrr - churn_mrr) * 12
                     AS net_new_arr
    FROM ${SCHEMA}.gold_monthly_revenue_kpis
    WHERE DATE_FORMAT(month, 'yyyy-MM') <= :month
    GROUP BY YEAR(month), QUARTER(month)
    ORDER BY year, quarter
    `,
    { month }
  );

  const quarters = rows.map((row) => ({
    quarter: `${Number(row.year)}-Q${Number(row.quarter)}`,
    endMonth: `${Number(row.year)}-${String(Number(row.quarter) * 3).padStart(2, "0")}`,
    months: Number(row.months),
    netNewArr: Number(row.net_new_arr ?? 0),
  }));

  // Le trimestre en cours = la dernière ligne
  const current = quarters.at(-1);

  if (!current) {
    return { quarter: null, available: false as const };
  }

  // Les trimestres précédents complets (3 mois), les 4 derniers
  const basedOn = quarters
    .slice(0, -1)
    .filter((q) => q.months === 3)
    .slice(-QUARTERS_FOR_GOAL);

  if (basedOn.length === 0) {
    return { quarter: current.quarter, available: false as const };
  }

  const average =
    basedOn.reduce((sum, q) => sum + q.netNewArr, 0) / basedOn.length;

  const goalArr = average * (1 + GOAL_GROWTH);
  const typicalMonthArr = average / 3;
  const monthsRemaining = 3 - current.months;
  const bookedArr = current.netNewArr;
  const forecastArr = bookedArr + typicalMonthArr * monthsRemaining;

  const asOf = lastDayOfMonth(month);
  const quarterEnd = lastDayOfMonth(current.endMonth);

  return {
    quarter: current.quarter,
    available: true as const,
    goalArr: Math.round(goalArr),
    bookedArr: Math.round(bookedArr),
    forecastArr: Math.round(forecastArr),
    typicalMonthArr: Math.round(typicalMonthArr),
    monthsRemaining,
    daysLeft: daysBetween(asOf, quarterEnd),
    pctBooked: Math.round((100 * bookedArr) / goalArr),
    pctForecast: Math.round((100 * forecastArr) / goalArr),
    method: `Average net new ARR of the last ${basedOn.length} complete quarters + ${GOAL_GROWTH * 100}%`,
    basedOn: basedOn.map((q) => ({
      quarter: q.quarter,
      netNewArr: Math.round(q.netNewArr),
    })),
  };
}

// =========================================================
// PARTIE 2 : SITUATIONS DU MOIS + RÉPARTITION (M2b → M2c-2)
// =========================================================

type BriefLane = "today" | "readyToGrow" | "team" | "info";

type BriefSituation = {
  customerId: string;
  companyName: string;
  industry: string;
  companySize: string;
  arrAtStake: number; // ARR = MRR × 12
  signalTypes: string[];
  evidence: string[]; // les descriptions des signaux, en phrases
  leadingRisks: number;
  nextRenewal: string | null;
  daysToRenewal: number | null;
  lane: BriefLane;
  owner: TeamMemberName | null; // seulement pour les situations « team »
  ownerReason: string | null;
  suggestedOwner: TeamMemberName | null; // proposé par la règle (sauf « info »)
  suggestedReason: string | null;
};

// La règle v2, écrite une seule fois, lisible par un humain
function chooseLane(s: {
  arrAtStake: number;
  leadingRisks: number;
  leadingSignals: number;
  risks: number;
  churns: number;
  daysToRenewal: number | null;
}): BriefLane {
  // 1. Déjà arrivé (churn) ou rien d'actionnable → pour information
  if (s.churns > 0 || s.leadingSignals === 0) {
    return "info";
  }

  const days = s.daysToRenewal ?? Infinity;

  // 2. Risque avancé → le VP décide aujourd'hui si l'enjeu le justifie
  if (s.leadingRisks > 0) {
    const bigAccount = s.arrAtStake >= VP_ARR_THRESHOLD;
    const urgentRenewal =
      s.arrAtStake >= URGENT_ARR_THRESHOLD && days <= URGENT_RENEWAL_DAYS;
    const compoundingBeforeRenewal =
      s.leadingRisks >= 2 && days < COMPOUNDING_RENEWAL_DAYS;

    if (bigAccount || urgentRenewal || compoundingBeforeRenewal) {
      return "today";
    }
    return "team";
  }

  // 3. Opportunité seule → ce mois-ci, si le compte est assez gros
  if (s.risks === 0 && s.arrAtStake >= VP_ARR_THRESHOLD) {
    return "readyToGrow";
  }

  return "team";
}

// Règle de routage (décision du 7 oct. 2026, option A), dans cet ordre
function chooseOwner(s: {
  signalTypes: string[];
  risks: number;
  companySize: string;
}): { owner: TeamMemberName; ownerReason: string } {
  if (s.risks === 0 && s.signalTypes.includes("Expansion Ready")) {
    return { owner: "Sofia Ramirez", ownerReason: "Expansion opportunity" };
  }
  if (s.signalTypes.includes("Support Spike")) {
    return { owner: "David Chen", ownerReason: "Product issue (critical tickets)" };
  }
  if (s.companySize === "Enterprise") {
    return { owner: "Julie Tremblay", ownerReason: "Enterprise account" };
  }
  return { owner: "Marc Gagnon", ownerReason: `${s.companySize} account` };
}

export async function getBriefSituations(
  databricks: DatabricksClient,
  month: string,
  asOf: string
) {
  const rows = await query(
    databricks,
    `
    WITH situations AS (
      SELECT
        customer_id,
        MAX(mrr_at_stake) AS mrr_at_stake,
        COUNT_IF(signal_direction = 'Risk' AND signal_timing = 'Leading')
                                                AS leading_risks,
        COUNT_IF(signal_timing = 'Leading')     AS leading_signals,
        COUNT_IF(signal_direction = 'Risk')     AS risks,
        COUNT_IF(signal_type = 'Churn')         AS churns,
        CONCAT_WS(', ', COLLECT_SET(signal_type)) AS signal_types,
        CONCAT_WS(' | ', COLLECT_LIST(description)) AS evidence
      FROM ${SCHEMA}.gold_customer_signal_events
      WHERE DATE_FORMAT(month, 'yyyy-MM') = :month
      GROUP BY customer_id
    ),
    renewals AS (
      SELECT
        customer_id,
        ADD_MONTHS(
          contract_start_date,
          12 * (YEAR(DATE(:asOf)) - YEAR(contract_start_date))
        ) AS anniversary
      FROM ${SCHEMA}.subscriptions
    ),
    next_renewals AS (
      SELECT
        customer_id,
        CASE
          WHEN anniversary > DATE(:asOf) THEN anniversary
          ELSE ADD_MONTHS(anniversary, 12)
        END AS next_renewal
      FROM renewals
    )
    SELECT
      s.*,
      c.company_name,
      c.industry,
      c.company_size,
      DATE_FORMAT(r.next_renewal, 'yyyy-MM-dd') AS next_renewal,
      DATEDIFF(r.next_renewal, DATE(:asOf))     AS days_to_renewal
    FROM situations s
    LEFT JOIN ${SCHEMA}.customers c ON s.customer_id = c.customer_id
    LEFT JOIN next_renewals r       ON s.customer_id = r.customer_id
    `,
    { month, asOf }
  );

  const situations: BriefSituation[] = rows.map((row) => {
    const arrAtStake = Number(row.mrr_at_stake ?? 0) * 12;
    const leadingRisks = Number(row.leading_risks ?? 0);
    const daysToRenewal =
      row.days_to_renewal == null ? null : Number(row.days_to_renewal);
    const risks = Number(row.risks ?? 0);
    const companySize = String(row.company_size ?? "");
    const signalTypes = String(row.signal_types ?? "")
      .split(", ")
      .filter(Boolean);

    const lane = chooseLane({
      arrAtStake,
      leadingRisks,
      leadingSignals: Number(row.leading_signals ?? 0),
      risks,
      churns: Number(row.churns ?? 0),
      daysToRenewal,
    });

        // La personne que la règle de routage propose (sauf pour « info »)
    const suggestion =
      lane === "info" ? null : chooseOwner({ signalTypes, risks, companySize });

    // Seules les situations « team » sont déjà confiées à quelqu'un
    const assignment =
      lane === "team" && suggestion
        ? suggestion
        : { owner: null, ownerReason: null };
    return {
      customerId: String(row.customer_id),
      companyName: String(row.company_name ?? row.customer_id),
      industry: String(row.industry ?? ""),
      companySize,
      arrAtStake,
      signalTypes,
      evidence: String(row.evidence ?? "")
      .split(" | ")
      .filter(Boolean),
      leadingRisks,
      nextRenewal: row.next_renewal == null ? null : String(row.next_renewal),
      daysToRenewal,
      lane,
      ...assignment,
      suggestedOwner: suggestion?.owner ?? null,
      suggestedReason: suggestion?.ownerReason ?? null,
    };
  });

  // Tri de « Today » : renouvellement ≤ 30 j d'abord (le plus proche),
  // puis nombre de risques avancés, puis ARR en jeu
  const soon = (s: BriefSituation) =>
    s.daysToRenewal !== null && s.daysToRenewal <= COMPOUNDING_RENEWAL_DAYS;

  const today = situations
    .filter((s) => s.lane === "today")
    .sort((a, b) => {
      if (soon(a) !== soon(b)) return soon(a) ? -1 : 1;
      if (soon(a) && soon(b)) {
        return (a.daysToRenewal ?? 0) - (b.daysToRenewal ?? 0);
      }
      return b.leadingRisks - a.leadingRisks || b.arrAtStake - a.arrAtStake;
    });

  const byArr = (a: BriefSituation, b: BriefSituation) =>
    b.arrAtStake - a.arrAtStake;

  const readyToGrow = situations
    .filter((s) => s.lane === "readyToGrow")
    .sort(byArr);
  const team = situations.filter((s) => s.lane === "team").sort(byArr);
  const info = situations.filter((s) => s.lane === "info").sort(byArr);

  // Charge de chaque membre de l'équipe
  const teamLoad = TEAM.map((member) => {
    const mine = team.filter((s) => s.owner === member.name);
    return {
      name: member.name,
      role: member.role,
      situations: mine.length,
      arrAtStake: mine.reduce((sum, s) => sum + s.arrAtStake, 0),
    };
  });

  return {
    counts: {
      total: situations.length,
      today: today.length,
      readyToGrow: readyToGrow.length,
      team: team.length,
      info: info.length,
    },
    teamLoad,
    today,
    readyToGrow,
    team,
    info,
  };
}

// =========================================================
// PARTIE 3 : RENOUVELLEMENTS DU TRIMESTRE SUIVANT À RISQUE
// Client encore actif + renouvelle au trimestre suivant
// + au moins un risque avancé dans les 3 derniers mois
// =========================================================

export async function getNextQuarterRenewalsAtRisk(
  databricks: DatabricksClient,
  month: string,
  asOf: string
) {
  const quarter = nextQuarterOf(month);
  const lookbackFrom = addMonths(month, -(RISK_LOOKBACK_MONTHS - 1));

  const rows = await query(
    databricks,
    `
    WITH active_at_date AS (
      SELECT customer_id, ending_mrr * 12 AS arr
      FROM ${SCHEMA}.gold_customer_monthly_health
      WHERE DATE_FORMAT(month, 'yyyy-MM') = :month
        AND ending_mrr > 0
    ),
    renewals AS (
      SELECT
        customer_id,
        ADD_MONTHS(
          contract_start_date,
          12 * (YEAR(DATE(:asOf)) - YEAR(contract_start_date))
        ) AS anniversary
      FROM ${SCHEMA}.subscriptions
    ),
    next_renewals AS (
      SELECT
        customer_id,
        CASE
          WHEN anniversary > DATE(:asOf) THEN anniversary
          ELSE ADD_MONTHS(anniversary, 12)
        END AS next_renewal
      FROM renewals
    ),
    recent_risks AS (
      SELECT
        customer_id,
        COUNT(*) AS leading_risks,
        CONCAT_WS(', ', COLLECT_SET(signal_type)) AS signal_types,
        DATE_FORMAT(MAX(month), 'yyyy-MM') AS last_signal_month
      FROM ${SCHEMA}.gold_customer_signal_events
      WHERE signal_direction = 'Risk'
        AND signal_timing = 'Leading'
        AND DATE_FORMAT(month, 'yyyy-MM') BETWEEN :lookbackFrom AND :month
      GROUP BY customer_id
    )
    SELECT
      a.customer_id,
      c.company_name,
      a.arr,
      DATE_FORMAT(r.next_renewal, 'yyyy-MM-dd') AS next_renewal,
      DATEDIFF(r.next_renewal, DATE(:asOf))     AS days_to_renewal,
      k.leading_risks,
      k.signal_types,
      k.last_signal_month
    FROM active_at_date a
    JOIN next_renewals r  ON a.customer_id = r.customer_id
    JOIN recent_risks k   ON a.customer_id = k.customer_id
    LEFT JOIN ${SCHEMA}.customers c ON a.customer_id = c.customer_id
    WHERE r.next_renewal BETWEEN DATE(:from) AND DATE(:to)
    `,
    { month, asOf, lookbackFrom, from: quarter.from, to: quarter.to }
  );

  const renewals = rows.map((row) => ({
    customerId: String(row.customer_id),
    companyName: String(row.company_name ?? row.customer_id),
    arr: Number(row.arr ?? 0),
    nextRenewal: String(row.next_renewal),
    daysToRenewal: Number(row.days_to_renewal),
    leadingRisks: Number(row.leading_risks ?? 0),
    signalTypes: String(row.signal_types ?? "")
      .split(", ")
      .filter(Boolean),
    lastSignalMonth: String(row.last_signal_month ?? ""),
  }));

  // Les comptes importants, du renouvellement le plus proche au plus loin
  const keyAccounts = renewals
    .filter((r) => r.arr >= KEY_RENEWAL_ARR)
    .sort((a, b) => a.daysToRenewal - b.daysToRenewal);

  const smaller = renewals.filter((r) => r.arr < KEY_RENEWAL_ARR);

  const sumArr = (list: { arr: number }[]) =>
    Math.round(list.reduce((sum, r) => sum + r.arr, 0));

  return {
    quarter: quarter.label,
    from: quarter.from,
    to: quarter.to,
    rule: `Renews in ${quarter.label} + at least one leading risk signal since ${lookbackFrom}`,
    accounts: renewals.length,
    arrAtRisk: sumArr(renewals),
    keyAccounts,
    smallerAccounts: {
      accounts: smaller.length,
      arr: sumArr(smaller),
    },
  };
}

// =========================================================
// ROUTE : GET /api/brief?month=2026-08
// =========================================================

export function createBriefRouter(databricks: DatabricksClient) {
  const router = Router();

  router.get("/brief", async (req, res) => {
    const month = String(req.query.month ?? "");

    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({
        error:
          "Query parameter 'month' must use the format YYYY-MM (e.g. 2026-08).",
      });
      return;
    }

    try {
      const asOf = lastDayOfMonth(month);

      // Les trois requêtes partent en même temps
      const [goal, situations, nextQuarterRenewals] = await Promise.all([
        getQuarterGoal(databricks, month),
        getBriefSituations(databricks, month, asOf),
        getNextQuarterRenewalsAtRisk(databricks, month, asOf),
      ]);

      res.json({ month, asOf, goal, nextQuarterRenewals, ...situations });
    } catch (error) {
      console.error("Brief API error:", error);

      res.status(500).json({
        error: "Unable to build the morning brief.",
      });
    }
  });

  return router;
}