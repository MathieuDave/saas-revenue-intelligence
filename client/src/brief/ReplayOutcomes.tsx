import { useState } from "react";

import type { Situation } from "./types";
import { formatMoney } from "./briefText";
import { firstName, type Decision } from "./deskItems";
import "./ReplayOutcomes.css";

// =========================================================
// « WHAT HAPPENED NEXT » : la preuve par les données
// On avance de 3 mois et on montre ce qui est vraiment arrivé.
// Les données ne contiennent aucune action humaine : c'est le
// coût de l'inaction, pas l'effet des choix du VP.
// =========================================================

const API_URL = "http://localhost:3000/api";

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

const TAGS = {
  lost: "Lost",
  shrank: "Shrank",
  held: "Held",
  grew: "Grew",
} as const;

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

// Ce que le VP a décidé pendant le Replay
function yourDecision(decision: Decision | undefined): string {
  if (!decision) return "You did not decide";
  if (decision.action === "delegate") return `You gave it to ${firstName(decision.person ?? "")}`;
  if (decision.action === "take") return "You took it yourself";
  if (decision.action === "later") return "You moved it to later";
  return "You decided";
}

export default function ReplayOutcomes({
  month,
  decisions,
  onRestart,
}: {
  month: string;
  decisions: Decision[];
  onRestart: () => void;
}) {
  const [data, setData] = useState<OutcomesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reveal() {
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/outcomes?month=${month}`)
      .then((response) => {
        if (!response.ok) throw new Error(`API error ${response.status}`);
        return response.json() as Promise<OutcomesResponse>;
      })
      .then(setData)
      .catch(() => setError("What happened next could not load. Check the backend and try again."))
      .finally(() => setLoading(false));
  }

  function restart() {
    setData(null);
    onRestart();
  }

  if (!data) {
    return (
      <div className="replay__reveal">
        <button type="button" className="dbtn dbtn--primary" onClick={reveal} disabled={loading}>
          {loading ? "Looking three months ahead…" : "See what happened next"}
        </button>
        <span>Jumps three months ahead and shows what really happened.</span>
        {error && <p className="desk__error" role="alert">{error}</p>}
      </div>
    );
  }

  if (!data.available) {
    return (
      <p className="replay__honest">
        The data does not reach {monthName(data.endMonth)} yet, so there is
        nothing to show for this morning.
      </p>
    );
  }

  const { lesson } = data;

  return (
    <section className="replay" aria-labelledby="replay-title" aria-live="polite">
      <h2 id="replay-title" className="desk__title">What happened next</h2>
      <p className="replay__honest">
        {monthName(data.endMonth)}. The data holds no human actions, so this is
        what happened when no one acted on your agents’ warnings. It shows the
        cost of waiting, not the effect of your choices.
      </p>

      <div className="replay__rows">
        {data.desk.map((s) => (
          <div key={s.customerId} className="replay__row">
            <div>
              <div className="replay__name">{s.companyName}</div>
              <div className="replay__meta">
                {s.companySize}, {formatMoney(s.arrAtStake)}
              </div>
            </div>
            <div className="replay__you">
              {yourDecision(decisions.find((d) => d.id === s.customerId))}
            </div>
            <div>
              <span className={`replay__tag replay__tag--${s.outcome}`}>{TAGS[s.outcome]}</span>
              <p className="replay__text">{whatHappened(s, data.month)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="replay__notes">
        <div className="replay__note">
          <strong>
            {data.team.lost} of {data.team.flagged} lost
          </strong>
          Accounts your agents handed to the team that month and that left within
          three months, about {formatMoney(data.team.arrLost)} of ARR.
        </div>

        {lesson && (
          <div className="replay__note">
            <strong>One to learn from</strong>
            {lesson.companyName} ({formatMoney(lesson.arrAtStake)}) renewed in{" "}
            {lesson.daysToRenewal} days with a warning sign (
            {lesson.signalTypes.join(", ").toLowerCase()}). The rule sent it to{" "}
            {firstName(lesson.owner ?? "the team")} because it was under $25K,
            and it left in {lesson.churnMonth ? monthName(lesson.churnMonth) : "the following months"}.
            Worth testing a 30-day renewal window.
          </div>
        )}
      </div>

      <div className="replay__reveal">
        <button type="button" className="dbtn" onClick={restart}>
          Replay this morning again
        </button>
      </div>
    </section>
  );
}