// =========================================================
// La forme des données renvoyées par GET /api/brief
// (le miroir de server/src/routes/brief.ts)
// =========================================================

export type QuarterGoal = {
  quarter: string | null;
  available: boolean;
  goalArr?: number;
  bookedArr?: number;
  forecastArr?: number;
  daysLeft?: number;
  pctBooked?: number;
  pctForecast?: number;
  method?: string;
  // Pour montrer le calcul (« How are these numbers calculated? »)
  typicalMonthArr?: number; // un mois typique = le trimestre moyen ÷ 3
  monthsRemaining?: number; // les mois entiers qui restent au trimestre
  basedOn?: { quarter: string; netNewArr: number }[]; // les trimestres utilisés
};

export type Situation = {
  customerId: string;
  companyName: string;
  industry: string;
  companySize: string;
  arrAtStake: number;
  signalTypes: string[];
  evidence: string[];
  leadingRisks: number;
  nextRenewal: string | null;
  daysToRenewal: number | null;
  lane: "today" | "readyToGrow" | "team" | "info";
  owner: string | null;
  ownerReason: string | null;
  suggestedOwner: string | null;
  suggestedReason: string | null;
};

export type RenewalAtRisk = {
  customerId: string;
  companyName: string;
  arr: number;
  nextRenewal: string;
  daysToRenewal: number;
  leadingRisks: number;
  signalTypes: string[];
  lastSignalMonth: string;
};

export type TeamMemberLoad = {
  name: string;
  role: string;
  situations: number;
  arrAtStake: number;
};

export type BriefResponse = {
  month: string;
  asOf: string;
  goal: QuarterGoal;
  nextQuarterRenewals: {
    quarter: string;
    from: string;
    to: string;
    rule: string;
    accounts: number;
    arrAtRisk: number;
    keyAccounts: RenewalAtRisk[];
    smallerAccounts: { accounts: number; arr: number };
  };
  counts: {
    total: number;
    today: number;
    readyToGrow: number;
    team: number;
    info: number;
  };
  teamLoad: TeamMemberLoad[];
  today: Situation[];
  readyToGrow: Situation[];
  team: Situation[];
  info: Situation[];
};
// Un compte remis sur le bureau (« Put back on my desk »)
// Le miroir de GET /api/returns (server/src/routes/returns.ts)
export type DeskReturn = {
  customerId: string;
  companyName: string;
  status: string; // "worse" ou "shrank"
  reading: string; // ce que le suivi a constaté
  arr: number;
  previousAction: string | null; // la décision du mois dernier
  previousPerson: string | null;
};
