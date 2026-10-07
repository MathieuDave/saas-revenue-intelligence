import type {
  BriefResponse,
  RenewalAtRisk,
  Situation,
  TeamMemberLoad,
} from "./types";

// =========================================================
// CE QUI ARRIVE SUR LE BUREAU DU VP
// Logique pure (pas de React) : facile à lire et à tester.
// =========================================================

// Au-delà de ce nombre de situations, une personne est « déjà chargée »
export const HEAVY_LOAD = 25;

export type DeskItem =
  | { kind: "risk"; id: string; arr: number; situation: Situation }
  | {
      kind: "tradeoff";
      id: "rebalance";
      arr: 0;
      from: TeamMemberLoad;
      to: TeamMemberLoad;
      move: number;
    }
  | {
      kind: "q4";
      id: "q4";
      arr: number;
      quarter: string;
      from: string;
      to: string;
      accounts: RenewalAtRisk[];
    }
  | {
      kind: "grow";
      id: "grow";
      arr: number;
      accounts: Situation[];
      owner: string;
    };

export type Action =
  | "delegate" // une personne prend le compte
  | "take" // le VP le garde
  | "later" // reporté à demain
  | "rebalance" // arbitrage : on déplace des comptes
  | "keep" // arbitrage : on ne change rien
  | "route" // T4 : chaque compte à son responsable
  | "send"; // croissance : envoyé à l'Account Executive

export type Decision = {
  decisionId: string | null; // donné par le serveur ; null pendant l'enregistrement  
  id: string;
  action: Action;
  person: string | null;
  due: string | null; // "2026-09-04"
};

export function firstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

// L'ordre de la pile : les risques du jour, l'arbitrage, le T4, la croissance
export function buildDesk(brief: BriefResponse): DeskItem[] {
  const items: DeskItem[] = brief.today.map((s) => ({
    kind: "risk",
    id: s.customerId,
    arr: s.arrAtStake,
    situation: s,
  }));

  // Arbitrage : un CSM surchargé pendant qu'un autre a de la place
  const csms = brief.teamLoad.filter((m) => m.role.startsWith("CSM"));
  const sorted = [...csms].sort((a, b) => b.situations - a.situations);
  const heavy = sorted[0];
  const light = sorted.at(-1);

  if (
    heavy &&
    light &&
    heavy !== light &&
    heavy.situations >= HEAVY_LOAD &&
    heavy.situations >= 3 * Math.max(1, light.situations)
  ) {
    items.push({
      kind: "tradeoff",
      id: "rebalance",
      arr: 0,
      from: heavy,
      to: light,
      move: Math.min(10, Math.floor((heavy.situations - light.situations) / 2)),
    });
  }

  // Les renouvellements clés du trimestre suivant
  const next = brief.nextQuarterRenewals;
  if (next.keyAccounts.length > 0) {
    items.push({
      kind: "q4",
      id: "q4",
      arr: next.keyAccounts.reduce((sum, r) => sum + r.arr, 0),
      quarter: next.quarter,
      from: next.from,
      to: next.to,
      accounts: next.keyAccounts,
    });
  }

  // La croissance, pour l'Account Executive
  if (brief.readyToGrow.length > 0) {
    const executive = brief.teamLoad.find((m) =>
      m.role.includes("Account Executive")
    );
    items.push({
      kind: "grow",
      id: "grow",
      arr: brief.readyToGrow.reduce((sum, s) => sum + s.arrAtStake, 0),
      accounts: brief.readyToGrow,
      owner: executive?.name ?? "your account executive",
    });
  }

  return items;
}

// La charge de l'équipe, mise à jour par les décisions du VP
export function liveTeamLoad(
  teamLoad: TeamMemberLoad[],
  items: DeskItem[],
  decisions: Decision[]
): TeamMemberLoad[] {
  const delta = new Map<string, number>();
  const add = (name: string, n: number) =>
    delta.set(name, (delta.get(name) ?? 0) + n);

  for (const d of decisions) {
    const item = items.find((i) => i.id === d.id);
    if (!item) continue;

    if (d.action === "delegate" && d.person) add(d.person, 1);
    if (d.action === "rebalance" && item.kind === "tradeoff") {
      add(item.from.name, -item.move);
      add(item.to.name, item.move);
    }
    if (d.action === "send" && item.kind === "grow") {
      add(item.owner, item.accounts.length);
    }
  }

  return teamLoad.map((m) => ({
    ...m,
    situations: m.situations + (delta.get(m.name) ?? 0),
  }));
}

// La jauge : l'ARR à risque qui a un responsable et une échéance
export function coverage(items: DeskItem[], decisions: Decision[]) {
  const atRisk = items
    .filter((i) => i.kind === "risk" || i.kind === "q4")
    .reduce((sum, i) => sum + i.arr, 0);

  let covered = 0;
  let upside = 0;

  for (const d of decisions) {
    const item = items.find((i) => i.id === d.id);
    if (!item) continue;

    const owned = d.action === "delegate" || d.action === "take" || d.action === "route";
    if ((item.kind === "risk" || item.kind === "q4") && owned) covered += item.arr;
    if (item.kind === "grow" && d.action === "send") upside += item.arr;
  }

  return { atRisk, covered, upside };
}