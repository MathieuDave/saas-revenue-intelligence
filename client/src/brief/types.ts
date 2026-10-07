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