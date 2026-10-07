import type { Situation } from "./types";

// =========================================================
// Les phrases du brief, écrites à partir des données.
// Aucune phrase n'est écrite à la main pour un client précis :
// le même code fonctionne pour n'importe quel mois.
// =========================================================

// 837811 → "$838K" ; 1250000 → "$1.3M"
export function formatMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value / 1000)}K`;
}

// "2026-08-31" → "Monday, August 31"
export function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
// "2025-10-31" → "Friday, October 31, 2025"
export function formatLongDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
// "2026-09-07" → "Sep 7, 2026"
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "2026-Q4" → "Q4"
export function shortQuarter(quarter: string | null): string {
  return quarter?.split("-")[1] ?? "This quarter";
}

const NUMBER_WORDS = [
  "No", "One", "Two", "Three", "Four", "Five",
  "Six", "Seven", "Eight", "Nine", "Ten",
];

export function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

// Le signal de risque le plus parlant d'une situation
function mainRisk(s: Situation): string {
  const order = ["Usage Drop", "Support Spike", "Negative Feedback"];
  return order.find((type) => s.signalTypes.includes(type)) ?? "Usage Drop";
}

const RISK_PHRASE: Record<string, string> = {
  "Usage Drop": "usage just dropped",
  "Support Spike": "critical tickets keep coming in",
  "Negative Feedback": "the customer is unhappy",
};

// « Pourquoi cette carte est sur ton bureau » (règle v2 en clair)
export function whyOnDesk(s: Situation): string {
  const money = formatMoney(s.arrAtStake);
  const phrase = RISK_PHRASE[mainRisk(s)] ?? "a warning sign appeared";
  const days = s.daysToRenewal;

  if (days !== null && days <= 14) {
    const prefix = s.arrAtStake < 25_000 ? `It is under the $25K line, but it` : "It";
    return `${prefix} renews in ${days} days and ${phrase}.`;
  }
  if (s.leadingRisks >= 2) {
    return `Two warning signs at once on a ${money} account.`;
  }
  return `${money} at stake and ${phrase}.`;
}

// « Si rien ne se passe » : seulement des faits, jamais une probabilité
export function ifNothingHappens(s: Situation): string {
  const days = s.daysToRenewal;

  if (days !== null && days <= 30) {
    return `If nothing happens: the contract renews in ${days} days with no one assigned.`;
  }

  const months = days === null ? null : Math.max(1, Math.round(days / 30));
  const before = months === null ? "" : `, ${months} months before renewal`;

  switch (mainRisk(s)) {
    case "Negative Feedback":
      return `If nothing happens: the complaint stays unanswered${before}.`;
    case "Support Spike":
      return `If nothing happens: the critical tickets keep piling up${before}.`;
    default:
      return `If nothing happens: usage keeps falling with no one assigned${before}.`;
  }
}

// La recommandation par défaut (le « playbook »), avant toute enquête de l'agent
export function playbook(s: Situation): string {
  const days = s.daysToRenewal;
  const urgent = days !== null && days <= 14 ? "Call before the renewal. " : "";

  switch (mainRisk(s)) {
    case "Negative Feedback":
      return `${urgent}Read the feedback with the account owner and answer the customer within 48 hours.`;
    case "Support Spike":
      return `${urgent}Get product and support on one call to close the critical tickets.`;
    default:
      return `${urgent}Book a usage review with the main contact and find out which team stopped logging in.`;
  }
}

// « Renews Sep 7, 2026, in 7 days »
export function renewalLabel(s: Situation): string {
  if (!s.nextRenewal || s.daysToRenewal === null) return "";
  const date = formatDate(s.nextRenewal);
  return s.daysToRenewal <= 60
    ? `Renews ${date}, in ${s.daysToRenewal} days`
    : `Renews ${date}`;
}


// =========================================================
// LES ÉCHÉANCES PROPOSÉES
// Calculées à partir de la date du brief et du renouvellement.
// =========================================================

export type DueOption = {
  label: string;
  date: string; // "2026-09-04"
  afterRenewal: boolean;
};

// "2026-08-31" + 4 jours → "2026-09-04"
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "2026-09-04" → "Fri Sep 4"
export function shortDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`)
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
    .replace(",", "");
}

export function dueOptions(s: Situation, asOf: string): DueOption[] {
  const dayOfWeek = new Date(`${asOf}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  const daysToFriday = (5 - dayOfWeek + 7) % 7 || 7;

  const in48h = { label: "Within 48 hours", date: addDays(asOf, 2) };
  const thisWeek = { label: "This week", date: addDays(asOf, daysToFriday) };
  const twoWeeks = { label: "In two weeks", date: addDays(asOf, 14) };

  let choices = [thisWeek, in48h, twoWeeks];

  if (s.nextRenewal && s.daysToRenewal !== null && s.daysToRenewal <= 14) {
    // Renouvellement imminent : la proposition est « avant le renouvellement »
    const before = {
      label: "Before renewal",
      date: addDays(s.nextRenewal, -3) > asOf ? addDays(s.nextRenewal, -3) : addDays(asOf, 1),
    };
    choices = [before, in48h, twoWeeks];
  } else if (mainRisk(s) === "Negative Feedback") {
    // Un client mécontent : répondre vite
    choices = [in48h, thisWeek, twoWeeks];
  }

  // Pas deux propositions à la même date
  const seen = new Set<string>();
  return choices
    .filter((c) => (seen.has(c.date) ? false : (seen.add(c.date), true)))
    .map((c) => ({
      label: `${c.label}, ${shortDay(c.date)}`,
      date: c.date,
      afterRenewal: s.nextRenewal !== null && c.date > s.nextRenewal,
    }));
}