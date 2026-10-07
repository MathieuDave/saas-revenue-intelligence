import { useEffect, useState } from "react";

import type { Situation } from "./types";
import { formatLongDay, formatMoney } from "./briefText";
import { firstName } from "./deskItems";
import "./TrackRecord.css";

// =========================================================
// « CAN YOU TRUST YOUR AGENTS? »
// Pourquoi le VP devrait prendre les cartes au sérieux :
// le bilan des agents sur son propre historique, et un vrai
// matin passé, avec ce qui est arrivé quand personne n'a agi.
// =========================================================

const API_URL = "http://localhost:3000/api";

// Le matin d'exemple : choisi pour ses issues contrastées
// (un compte perdu, un stable, un qui grandit). Les chiffres
// affichés, eux, sont tous calculés par l'API.
const EXAMPLE_MONTH = "2025-10";

type TrackRecordResponse = {
  month: string;
  since: string | null;
  churned: number;
  warned: number;
  warnedPct: number;
  arrLostPct: number;
  avgMonthsAhead: number;
};

type OutcomeSituation = Situation & {
  outcome: "lost" | "shrank" | "held" | "grew";
  churnMonth: string | null;
  mrrBefore: number;
  mrrAfter: number;
  utilBefore: number | null;
  utilAfter: number | null;
};

type OutcomesResponse =
  | { month: string; endMonth: string; available: false }
  | {
      month: string;
      endMonth: string;
      available: true;
      desk: OutcomeSituation[];
      team: { flagged: number; lost: number; arrLost: number };
      lesson: OutcomeSituation | null;
    };

// "2026-01" → "January 2026"
function monthName(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "2025-10" → "2025-10-31"
function lastDay(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 0)).toISOString().slice(0, 10);
}

// Nombre de mois entre "2025-10" et "2026-01" → 3
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return ((ty ?? 0) - (fy ?? 0)) * 12 + ((tm ?? 0) - (fm ?? 0));
}

// 2470 → "$2,470"
function dollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

const TAGS = { lost: "Lost", shrank: "Shrank", held: "Held", grew: "Grew" } as const;

// Ce qui est arrivé, en une phrase écrite à partir des faits
function whatHappened(s: OutcomeSituation, month: string): string {
  const usage =
    s.utilBefore === null || s.utilAfter === null
      ? null
      : s.utilBefore === s.utilAfter
        ? `usage held at ${s.utilAfter}%`
        : `usage went from ${s.utilBefore}% to ${s.utilAfter}%`;

  switch (s.outcome) {
    case "lost": {
      const after = s.churnMonth ? monthsBetween(month, s.churnMonth) : null;
      return (
        `${usage ? `${usage.charAt(0).toUpperCase()}${usage.slice(1)}. ` : ""}` +
        `The customer left in ${s.churnMonth ? monthName(s.churnMonth) : "the following months"}` +
        `${after ? `, ${after} months after your agents flagged it` : ""}. ` +
        `Monthly revenue went from ${dollars(s.mrrBefore)} to $0.`
      );
    }
    case "grew":
      return `Stayed and grew: monthly revenue rose from ${dollars(s.mrrBefore)} to ${dollars(s.mrrAfter)}${usage ? `, and ${usage}` : ""}.`;
    case "shrank":
      return `Stayed but cut back: monthly revenue went from ${dollars(s.mrrBefore)} to ${dollars(s.mrrAfter)}${usage ? `, and ${usage}` : ""}.`;
    default:
      return `Stayed: monthly revenue held at ${dollars(s.mrrAfter)}${usage ? `, while ${usage}` : ""}.`;
  }
}

export default function TrackRecord({ month }: { month: string }) {
  const [record, setRecord] = useState<TrackRecordResponse | null>(null);
  const [example, setExample] = useState<OutcomesResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const get = <T,>(path: string) =>
      fetch(`${API_URL}${path}`, { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json() as Promise<T>;
      });

    Promise.all([
      get<TrackRecordResponse>(`/track-record?month=${month}`),
      get<OutcomesResponse>(`/outcomes?month=${EXAMPLE_MONTH}`),
    ])
      .then(([loadedRecord, loadedExample]) => {
        setRecord(loadedRecord);
        setExample(loadedExample);
      })
      .catch((err: unknown) => {
        // Section secondaire : en cas d'erreur, on ne l'affiche simplement pas
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(err);
      });

    return () => controller.abort();
  }, [month]);

  if (!record || record.churned === 0) return null;

  return (
    <section className="trust" aria-labelledby="trust-title">
      <h2 id="trust-title" className="desk__title">Can you trust your agents?</h2>

      <p className="trust__claim">
        {record.warnedPct}% of the customers you lost were flagged by your
        agents, about {record.avgMonthsAhead} months before they left.
      </p>
      <p className="trust__basis">
        {record.warned} of {record.churned} lost customers
        {record.since ? ` since ${monthName(record.since)}` : ""}, and{" "}
        {record.arrLostPct}% of the ARR lost. Measured on your own history.
      </p>

      {example?.available && (
        <>
          <h3 className="trust__subtitle">
            One morning, replayed: {formatLongDay(lastDay(example.month))}
          </h3>
          <p className="trust__honest">
            Your agents put these accounts on your desk that morning. The data
            holds no human actions, so this is what happened when no one acted.
          </p>

          <div className="trust__rows">
            {example.desk.map((s) => (
              <div key={s.customerId} className="trust__row">
                <div>
                  <div className="trust__name">{s.companyName}</div>
                  <div className="trust__meta">
                    {s.companySize}, {formatMoney(s.arrAtStake)}, {s.signalTypes.join(", ")}
                  </div>
                </div>
                <div>
                  <span className={`trust__tag trust__tag--${s.outcome}`}>{TAGS[s.outcome]}</span>
                  <p className="trust__text">{whatHappened(s, example.month)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="trust__notes">
            <div className="trust__note">
              <strong>
                {example.team.lost} of {example.team.flagged} lost
              </strong>
              Accounts your agents handed to the team that month and that left
              within three months, about {formatMoney(example.team.arrLost)} of ARR.
            </div>

            {example.lesson && (
              <div className="trust__note">
                <strong>One to learn from</strong>
                {example.lesson.companyName} ({formatMoney(example.lesson.arrAtStake)})
                renewed in {example.lesson.daysToRenewal} days with a warning sign (
                {example.lesson.signalTypes.join(", ").toLowerCase()}). The rule sent
                it to {firstName(example.lesson.owner ?? "the team")} because it was
                under $25K, and it left in{" "}
                {example.lesson.churnMonth ? monthName(example.lesson.churnMonth) : "the following months"}.
                Worth testing a 30-day renewal window.
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}