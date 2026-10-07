// =========================================================
// « SEE THE DATA » : les données d'un compte, arrêtées à la date du brief
// Le miroir de GET /api/accounts/:customerId/evidence (server/src/routes/accounts.ts)
// =========================================================

const API_URL = "http://localhost:3000/api";

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
  category: string | null;
  detail: string; // statut du ticket, ou sentiment du feedback
  comment: string | null;
  ageDays: number | null; // tickets : jours entre l'ouverture et la date du brief
};

export type AccountSignal = {
  month: string; // "2026-08"
  type: string; // "Usage Drop"
  direction: string; // "Risk" ou "Opportunity"
  severity: string;
  description: string;
};

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

export async function fetchEvidence(
  customerId: string,
  asOf: string,
  signal: AbortSignal
): Promise<AccountEvidence> {
  const response = await fetch(
    `${API_URL}/accounts/${customerId}/evidence?asOf=${asOf}`,
    { signal }
  );
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return (await response.json()) as AccountEvidence;
}